//! The runtime state: the llama-server lifecycle and the registry of in-flight
//! requests.

use std::{
    collections::{HashMap, VecDeque},
    net::TcpListener,
    path::Path,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};

use reqwest::Client;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tokio::sync::{watch, Mutex};
use tokio_util::sync::CancellationToken;

use crate::{
    db::Database, lesson_import::IMAGE_TOKEN_BUDGET,
    model_acquisition::ModelAcquisitionRuntime,
};

use super::{
    capacity::{EnginePermit, EngineQueue},
    port::{extract_completion, ServerCompletion},
};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(90);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(250);
const DIAGNOSTIC_LINE_LIMIT: usize = 12;

pub struct InferenceRuntime {
    client: Client,
    server: Mutex<Option<RunningServer>>,
    startup: Mutex<()>,
    pub(crate) requests: RequestRegistry,
    queue: EngineQueue,
}

impl Default for InferenceRuntime {
    fn default() -> Self {
        Self {
            client: Client::new(),
            server: Mutex::new(None),
            startup: Mutex::new(()),
            requests: RequestRegistry::default(),
            queue: EngineQueue::default(),
        }
    }
}

struct RunningServer {
    base_url: String,
    child: Option<CommandChild>,
    terminated: watch::Receiver<bool>,
}

/// How the engine is started: the files it reads from, where it listens, and
/// the limits it runs under.
fn engine_arguments(model_path: &Path, sight_path: Option<&Path>, port: u16) -> Vec<String> {
    let mut arguments = vec![
        "--model".to_owned(),
        model_path.to_string_lossy().into_owned(),
        "--host".to_owned(),
        "127.0.0.1".to_owned(),
        "--port".to_owned(),
        port.to_string(),
        "--ctx-size".to_owned(),
        "8192".to_owned(),
        "--parallel".to_owned(),
        "1".to_owned(),
        "--n-gpu-layers".to_owned(),
        "all".to_owned(),
        "--no-ui".to_owned(),
        "--metrics".to_owned(),
        "--jinja".to_owned(),
        // Bounded thinking: the model may think up to this many tokens before
        // the server closes the trace and it must answer. All five real-model
        // pipeline gates pass at 1024; unrestricted thinking ruminates past any
        // output budget on hard classification, and 0 fails two of the gates
        // outright.
        "--reasoning-budget".to_owned(),
        "1024".to_owned(),
        // A looping thought spends the whole budget before the answer is
        // written, and what the teacher sees is "the local engine hit its
        // output limit mid-answer". Two upstream reports give these values for
        // Gemma 4 — gemma#727 and the looping-output thread on
        // discuss.ai.google.dev — and both note that lowering temperature does
        // not help, which is why this is here and not in the signatures, which
        // already sample at 0.1.
        "--repeat-penalty".to_owned(),
        "1.08".to_owned(),
        "--repeat-last-n".to_owned(),
        "4096".to_owned(),
    ];
    if let Some(path) = sight_path {
        arguments.push("--mmproj".to_owned());
        arguments.push(path.to_string_lossy().into_owned());
        // Left to itself the engine reads any photograph as a thumbnail of a
        // few hundred tokens, which is not enough to resolve handwriting. It
        // decodes what it is given in one non-causal batch, so a batch too
        // small to hold a page aborts the process rather than failing the
        // call: the size a page may reach and the batch that must hold it are
        // one number.
        arguments.push("--image-max-tokens".to_owned());
        arguments.push(IMAGE_TOKEN_BUDGET.to_string());
        arguments.push("--ubatch-size".to_owned());
        arguments.push(IMAGE_TOKEN_BUDGET.to_string());
    }
    arguments
}

impl InferenceRuntime {
    /// Cancels the in-flight request registered under this id, if any — the
    /// task registry stops work through here so a task id and its transport
    /// request stay one identifier.
    pub(crate) async fn cancel_request(&self, request_id: &str) {
        self.requests.cancel(request_id).await;
    }

    /// Waits for the engine on a call the teacher is waiting through, so it
    /// cannot race a lesson that is already generating.
    pub(crate) async fn wait_for_engine(
        &self,
        cancellation: &CancellationToken,
    ) -> Option<EnginePermit> {
        self.queue.take_slot(cancellation).await
    }

    /// Waits for this task's turn at the engine. `None` means the teacher
    /// stopped the work before it ever got there.
    pub(crate) async fn admit<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        task_id: &str,
        cancellation: &CancellationToken,
    ) -> Option<EnginePermit> {
        self.queue.admit(app, database, task_id, cancellation).await
    }

    pub(super) async fn complete_transport<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        request: &Value,
        operation: &str,
    ) -> Result<ServerCompletion, String> {
        let base_url = self.ensure_started(app).await?;
        let response = self
            .client
            .post(format!("{base_url}/v1/chat/completions"))
            .json(request)
            .send()
            .await
            .map_err(|error| format!("{operation} could not be completed: {error}"))?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| format!("The local response could not be read: {error}"))?;

        if !status.is_success() {
            return Err(format!(
                "{operation} could not be completed (status {}).",
                status.as_u16()
            ));
        }

        extract_completion(&body)
    }

    async fn ensure_started<R: Runtime>(&self, app: &AppHandle<R>) -> Result<String, String> {
        if let Some(base_url) = self.running_base_url().await {
            return Ok(base_url);
        }

        let _startup_guard = self.startup.lock().await;
        if let Some(base_url) = self.running_base_url().await {
            return Ok(base_url);
        }

        let running_server = self.start_server(app).await?;
        let base_url = running_server.base_url.clone();
        *self.server.lock().await = Some(running_server);
        Ok(base_url)
    }

    async fn running_base_url(&self) -> Option<String> {
        let mut server = self.server.lock().await;
        let is_terminated = server
            .as_ref()
            .is_some_and(|running| *running.terminated.borrow());

        if is_terminated {
            if let Some(terminated) = server.take() {
                request_server_shutdown(terminated);
            }
            return None;
        }

        server.as_ref().map(|running| running.base_url.clone())
    }

    async fn start_server<R: Runtime>(&self, app: &AppHandle<R>) -> Result<RunningServer, String> {
        let database = app.state::<Database>();
        let manifest = crate::model_catalogue::selected_model(&database)?.manifest;
        let acquisition = app.state::<ModelAcquisitionRuntime>();
        let model_path = acquisition.verified_model_path(app, &database).await?;
        // A model that can be shown a photograph needs its projector beside it.
        // Without a verified copy the engine starts as a reader of text only,
        // and the screens that want a photograph are not offered.
        let sight_path = acquisition.verified_sight_path(app, &database).await;
        super::capacity::ensure_machine_can_hold_engine(manifest, sight_path.is_some())?;

        let port = available_loopback_port()?;
        let base_url = format!("http://127.0.0.1:{port}");
        let diagnostics = Arc::new(StdMutex::new(VecDeque::new()));
        let (terminated_sender, terminated) = watch::channel(false);

        let command = app
            .shell()
            .sidecar("graspy-inference-runner")
            .map_err(|error| format!("The local engine is unavailable: {error}"))?
            .args(engine_arguments(&model_path, sight_path.as_deref(), port));

        let (mut events, child) = command
            .spawn()
            .map_err(|error| format!("The local engine could not start: {error}"))?;
        let event_diagnostics = Arc::clone(&diagnostics);

        tauri::async_runtime::spawn(async move {
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                        push_diagnostic(&event_diagnostics, &bytes);
                    }
                    CommandEvent::Error(error) => {
                        push_diagnostic(&event_diagnostics, error.as_bytes());
                    }
                    CommandEvent::Terminated(_) => {
                        let _ = terminated_sender.send(true);
                    }
                    _ => {}
                }
            }
        });

        let running_server = RunningServer {
            base_url,
            child: Some(child),
            terminated,
        };

        if let Err(error) = self.wait_until_healthy(&running_server, &diagnostics).await {
            request_server_shutdown(running_server);
            return Err(error);
        }

        Ok(running_server)
    }

    async fn wait_until_healthy(
        &self,
        server: &RunningServer,
        diagnostics: &Arc<StdMutex<VecDeque<String>>>,
    ) -> Result<(), String> {
        let deadline = tokio::time::Instant::now() + STARTUP_TIMEOUT;

        loop {
            if *server.terminated.borrow() {
                return Err(startup_error(
                    "The local engine stopped during startup.",
                    diagnostics,
                ));
            }

            if self
                .client
                .get(format!("{}/health", server.base_url))
                .send()
                .await
                .is_ok_and(|response| response.status().is_success())
            {
                return Ok(());
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(startup_error(
                    "The local engine took too long to become ready.",
                    diagnostics,
                ));
            }

            tokio::time::sleep(HEALTH_POLL_INTERVAL).await;
        }
    }

    pub async fn shutdown(&self) {
        self.requests.cancel_all().await;
        if let Some(server) = self.server.lock().await.take() {
            request_server_shutdown(server);
        }
    }
}

#[derive(Default)]
pub(crate) struct RequestRegistry {
    active: Mutex<HashMap<String, CancellationToken>>,
}

impl RequestRegistry {
    pub(crate) async fn register(&self, request_id: &str) -> Result<CancellationToken, String> {
        let mut active = self.active.lock().await;
        if active.contains_key(request_id) {
            return Err("A local request with this identifier is already active.".to_owned());
        }

        let token = CancellationToken::new();
        active.insert(request_id.to_owned(), token.clone());
        Ok(token)
    }

    pub(crate) async fn cancel(&self, request_id: &str) {
        if let Some(token) = self.active.lock().await.get(request_id) {
            token.cancel();
        }
    }

    pub(crate) async fn finish(&self, request_id: &str) {
        self.active.lock().await.remove(request_id);
    }

    async fn cancel_all(&self) {
        let mut active = self.active.lock().await;
        for token in active.values() {
            token.cancel();
        }
        active.clear();
    }
}

fn request_server_shutdown(mut server: RunningServer) {
    if let Some(mut child) = server.child.take() {
        let _ = child.write(b"shutdown\n");
    }
}

fn available_loopback_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("A private local port is unavailable: {error}"))
}

fn push_diagnostic(diagnostics: &Arc<StdMutex<VecDeque<String>>>, bytes: &[u8]) {
    let line = String::from_utf8_lossy(bytes).trim().to_owned();
    if line.is_empty() {
        return;
    }

    if let Ok(mut diagnostics) = diagnostics.lock() {
        diagnostics.push_back(line);
        while diagnostics.len() > DIAGNOSTIC_LINE_LIMIT {
            diagnostics.pop_front();
        }
    }
}

fn startup_error(message: &str, diagnostics: &Arc<StdMutex<VecDeque<String>>>) -> String {
    let diagnostic_text = diagnostics
        .lock()
        .ok()
        .map(|lines| lines.iter().cloned().collect::<Vec<_>>().join("\n"))
        .unwrap_or_default();

    if diagnostic_text.is_empty() {
        message.to_owned()
    } else {
        format!("{message}\n{diagnostic_text}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn arguments_for(sight: Option<&str>) -> Vec<String> {
        engine_arguments(
            Path::new("/models/weights.gguf"),
            sight.map(Path::new),
            8080,
        )
    }

    fn value_after(arguments: &[String], flag: &str) -> Option<String> {
        let at = arguments.iter().position(|argument| argument == flag)?;
        arguments.get(at + 1).cloned()
    }

    /// A model that can be shown a photograph is only shown one if the engine
    /// is told where its projector is. Nothing else in the launch says so.
    #[test]
    fn the_engine_is_given_the_projector_when_there_is_one_to_give() {
        assert_eq!(
            value_after(&arguments_for(Some("/models/sight.gguf")), "--mmproj").as_deref(),
            Some("/models/sight.gguf")
        );
    }

    /// And a model without one starts as a reader of text, rather than starting
    /// with a flag pointing at nothing.
    #[test]
    fn the_engine_is_given_no_projector_when_there_is_none() {
        assert!(!arguments_for(None)
            .iter()
            .any(|argument| argument == "--mmproj"));
    }

    /// The engine decodes a photograph in one batch and aborts the process if
    /// a batch cannot hold it, and left to itself it shrinks any photograph to
    /// a thumbnail too coarse to read handwriting from. Both are the same
    /// number, and it is the one the bands are cut to.
    #[test]
    fn an_engine_that_can_see_is_started_able_to_hold_a_whole_band() {
        let arguments = arguments_for(Some("/models/sight.gguf"));

        for flag in ["--image-max-tokens", "--ubatch-size"] {
            assert_eq!(
                value_after(&arguments, flag),
                Some(IMAGE_TOKEN_BUDGET.to_string()),
                "{flag} must hold a whole band",
            );
        }
    }

    /// An engine that will never be shown a photograph is not made to carry
    /// batches sized for one.
    #[test]
    fn an_engine_that_cannot_see_keeps_the_batch_sizes_it_came_with() {
        let arguments = arguments_for(None);

        for flag in ["--image-max-tokens", "--ubatch-size"] {
            assert!(!arguments.iter().any(|argument| argument == flag), "{flag}");
        }
    }

    /// The limits a lesson is written under do not change because a photograph
    /// can be read. Looping in particular is what these hold back, and it is
    /// worse on a page of handwriting than on a prompt.
    #[test]
    fn the_limits_hold_whether_the_engine_can_see_or_not() {
        for sight in [None, Some("/models/sight.gguf")] {
            let arguments = arguments_for(sight);
            assert_eq!(
                value_after(&arguments, "--repeat-penalty").as_deref(),
                Some("1.08")
            );
            assert_eq!(
                value_after(&arguments, "--repeat-last-n").as_deref(),
                Some("4096")
            );
            assert_eq!(
                value_after(&arguments, "--reasoning-budget").as_deref(),
                Some("1024")
            );
            assert_eq!(
                value_after(&arguments, "--model").as_deref(),
                Some("/models/weights.gguf")
            );
        }
    }
}
