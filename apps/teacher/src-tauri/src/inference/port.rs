//! The llama-server transport: the request the model is shown and the response
//! envelope it returns.

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use tokio_util::sync::CancellationToken;

use crate::generation_program::domain::{
    CompletionFailure, CompletionFailureKind, StructuredCompletion, StructuredCompletionPort,
    StructuredCompletionRequest,
};

use super::model_view::without_bookkeeping;
use super::runtime::InferenceRuntime;

pub struct LlamaServerStructuredCompletionPort<'a, R: Runtime> {
    app: &'a AppHandle<R>,
    runtime: &'a InferenceRuntime,
    model_identity: &'a str,
}

impl<'a, R: Runtime> LlamaServerStructuredCompletionPort<'a, R> {
    pub fn new(
        app: &'a AppHandle<R>,
        runtime: &'a InferenceRuntime,
        model_identity: &'a str,
    ) -> Self {
        Self {
            app,
            runtime,
            model_identity,
        }
    }
}

impl<R: Runtime> StructuredCompletionPort for LlamaServerStructuredCompletionPort<'_, R> {
    fn model_identity(&self) -> &str {
        self.model_identity
    }

    async fn complete(
        &self,
        request: StructuredCompletionRequest,
        cancellation: CancellationToken,
    ) -> Result<StructuredCompletion, CompletionFailure> {
        let transport_request = build_llama_request(&request);
        let completion = tokio::select! {
            result = self.runtime.complete_transport(
                self.app,
                &transport_request,
                "Creating lesson content",
            ) => result,
            _ = cancellation.cancelled() => {
                return Err(CompletionFailure::new(
                    CompletionFailureKind::Cancelled,
                    vec!["Creation was cancelled.".to_owned()],
                ));
            }
        }
        .map_err(|error| CompletionFailure::new(CompletionFailureKind::Transport, vec![error]))?;
        Ok(StructuredCompletion {
            output_text: completion.content,
            model_identity: self.model_identity.to_owned(),
            input_tokens: completion.input_tokens,
            output_tokens: completion.output_tokens,
        })
    }
}

/// The request the model is sent, including which parts of the input it is shown.
///
/// Test ports call this too, so that what a test proves about a prompt is true of
/// the prompt the application sends.
pub(crate) fn build_llama_request(request: &StructuredCompletionRequest) -> Value {
    json!({
        "model": "graspy-local",
        "messages": [
            {
                "role": "system",
                "content": request.system_instructions,
            },
            {
                "role": "user",
                "content": what_the_model_is_shown(request),
            }
        ],
        "temperature": request.limits.temperature,
        "seed": request.limits.seed,
        "max_tokens": request.limits.max_output_tokens,
        "stream": false,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": request.signature_id,
                "strict": true,
                "schema": request.output_schema,
            }
        }
    })
}

/// The task, the input, and the page when there is a page.
///
/// A request with no page sends one string, which is what every text-only
/// signature has always sent. A request with one sends the parts the engine
/// reads a photograph from, the writing beside the instructions that ask for it.
fn what_the_model_is_shown(request: &StructuredCompletionRequest) -> Value {
    let asked = format!(
        "{}\n\nInput:\n{}",
        request.task_instructions,
        serde_json::to_string(&without_bookkeeping(&request.input)).expect("JSON input serializes"),
    );
    match &request.shown_page {
        None => json!(asked),
        Some(page) => json!([
            { "type": "text", "text": asked },
            { "type": "image_url", "image_url": { "url": page.data_url } },
        ]),
    }
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CompletionEnvelope {
    choices: Vec<CompletionChoice>,
    #[serde(default)]
    usage: Option<CompletionUsage>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CompletionChoice {
    message: CompletionMessage,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CompletionMessage {
    /// Null when the model spent the whole turn thinking: llama-server returns
    /// the trace as reasoning_content and leaves content empty.
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize, schemars::JsonSchema)]
struct CompletionUsage {
    #[serde(default)]
    prompt_tokens: u64,
    #[serde(default)]
    completion_tokens: u64,
}

pub(crate) struct ServerCompletion {
    pub(crate) content: String,
    pub(crate) input_tokens: u64,
    pub(crate) output_tokens: u64,
}

/// Reads the server envelope, refusing the two failures that used to reach the
/// schema layer as a bare "EOF while parsing a value": a completion cut off at
/// its output limit, and a turn that finished without writing an answer. Each
/// refusal names finish_reason and the tokens spent, because that pair is what
/// tells a budget problem from a prompt problem.
pub(crate) fn extract_completion(body: &str) -> Result<ServerCompletion, String> {
    let envelope: CompletionEnvelope = serde_json::from_str(body)
        .map_err(|_| "The local engine returned an invalid response.".to_owned())?;
    let usage = envelope.usage.unwrap_or(CompletionUsage {
        prompt_tokens: 0,
        completion_tokens: 0,
    });
    let choice = envelope
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| "The local engine returned an empty response.".to_owned())?;
    let finish_reason = choice
        .finish_reason
        .unwrap_or_else(|| "unreported".to_owned());
    if finish_reason == "length" {
        return Err(format!(
            "The local engine hit its output limit mid-answer ({} output tokens written).",
            usage.completion_tokens
        ));
    }
    let content = choice.message.content.unwrap_or_default();
    if content.trim().is_empty() {
        return Err(format!(
            "The local engine finished (\"{finish_reason}\") without writing an answer ({} output tokens).",
            usage.completion_tokens
        ));
    }
    Ok(ServerCompletion {
        content,
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation_program::domain::{CompletionLimits, ShownPage};

    fn asking(shown_page: Option<ShownPage>) -> StructuredCompletionRequest {
        StructuredCompletionRequest {
            invocation_id: "one".to_owned(),
            signature_id: "lesson-plan.reading".to_owned(),
            signature_version: "1".to_owned(),
            system_instructions: "Read what is written.".to_owned(),
            task_instructions: "Copy out the page.".to_owned(),
            input: json!({ "week": 2 }),
            output_schema: json!({ "type": "object" }),
            limits: CompletionLimits {
                temperature: 0.1,
                seed: 31,
                max_output_tokens: 100,
                timeout_seconds: 60,
            },
            shown_page,
        }
    }

    fn user_content(request: &StructuredCompletionRequest) -> Value {
        build_llama_request(request)["messages"][1]["content"].clone()
    }

    /// Every signature graspy had before a page could be shown sends one
    /// string, and still does.
    #[test]
    fn a_request_with_no_page_asks_in_the_words_it_always_did() {
        let content = user_content(&asking(None));

        let asked = content.as_str().expect("one string");
        assert!(asked.starts_with("Copy out the page."));
        assert!(asked.contains("\"week\":2"));
    }

    /// The engine reads a photograph from a part of its own beside the writing
    /// that asks for it, so both have to arrive together.
    #[test]
    fn a_request_with_a_page_shows_it_beside_the_asking() {
        let content = user_content(&asking(Some(ShownPage {
            data_url: "data:image/png;base64,AAAA".to_owned(),
        })));

        let parts = content.as_array().expect("parts");
        assert_eq!(parts[0]["type"], "text");
        assert!(parts[0]["text"]
            .as_str()
            .expect("asked")
            .contains("Copy out the page."));
        assert_eq!(parts[1]["type"], "image_url");
        assert_eq!(parts[1]["image_url"]["url"], "data:image/png;base64,AAAA");
    }

    /// Two readings of two different pages are two different prompts. Recording
    /// them as one would hide which photograph produced which answer.
    #[test]
    fn two_pages_read_as_two_prompts() {
        let page = |bytes: &str| {
            Some(ShownPage {
                data_url: format!("data:image/png;base64,{bytes}"),
            })
        };

        assert_ne!(
            asking(page("AAAA")).prompt_sha256(),
            asking(page("BBBB")).prompt_sha256()
        );
        assert_ne!(
            asking(page("AAAA")).prompt_sha256(),
            asking(None).prompt_sha256()
        );
        assert_eq!(
            asking(page("AAAA")).prompt_sha256(),
            asking(page("AAAA")).prompt_sha256()
        );
    }
}
