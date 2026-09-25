//! What the engine can take at once, and what the machine must have to run it.
//!
//! The engine is one model in one process with one slot (`--parallel 1`, for
//! the context-size reason the sidecar's arguments record). That is not a
//! shortcoming to work around: a second lesson sent at the same machine does
//! not run twice as fast, it runs behind the first one inside llama.cpp's own
//! queue, where graspy cannot see it, cannot cancel it, and cannot stop its own
//! node timeouts from running down while it waits.
//!
//! So the queue is graspy's. Work waits here, recorded and cancellable, and
//! reaches the engine one job at a time. A task waiting for its turn has not
//! started, so its timeouts are not running and a teacher who changes their
//! mind stops it without anything having been spent.

use std::sync::Arc;

use tauri::{AppHandle, Runtime};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::{db::Database, model_catalogue::ModelManifest, task_registry};

/// What the engine needs beyond the model's own bytes: the context window's
/// key-value cache, the process, and enough room that the machine is not
/// paging while it generates.
const ENGINE_HEADROOM_BYTES: u64 = 1_500_000_000;

/// The engine's one slot, and the line of work waiting for it.
///
/// Turns are taken in the order they were asked for — `Semaphore` hands its
/// permits out first-come-first-served — which is the order the teacher sees
/// on screen.
pub(crate) struct EngineQueue {
    slot: Arc<Semaphore>,
}

impl Default for EngineQueue {
    fn default() -> Self {
        Self {
            slot: Arc::new(Semaphore::new(1)),
        }
    }
}

/// Held for as long as its work has the engine, and returned by dropping it —
/// so work that panics or is cancelled cannot keep the slot.
pub(crate) struct EnginePermit {
    _permit: OwnedSemaphorePermit,
}

impl EngineQueue {
    /// Waits for the engine. `None` means the teacher stopped the work while
    /// it waited, so it never reached the model and nothing was spent.
    ///
    /// This is what a call the teacher is sitting in front of uses: it must
    /// not race a lesson that is already generating, but it is over in seconds
    /// and does not belong in the list of work you can walk away from.
    pub(crate) async fn take_slot(&self, cancellation: &CancellationToken) -> Option<EnginePermit> {
        let slot = Arc::clone(&self.slot);
        tokio::select! {
            biased;
            () = cancellation.cancelled() => None,
            permit = slot.acquire_owned() => Some(EnginePermit { _permit: permit.ok()? }),
        }
    }

    /// Waits for the engine on a recorded task's behalf, and marks that task
    /// running the moment it has the slot.
    ///
    /// `None` again means the work ended before it reached the engine — either
    /// the teacher stopped it while it waited, or the row was closed from
    /// elsewhere. The caller closes the task as cancelled.
    pub(crate) async fn admit<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        database: &Database,
        task_id: &str,
        cancellation: &CancellationToken,
    ) -> Option<EnginePermit> {
        let permit = self.take_slot(cancellation).await?;

        // The wait may have been long. Starting is the claim that this task is
        // still the teacher's intention, and a row closed while it waited
        // refuses it.
        match task_registry::start_running(app, database, task_id) {
            Ok(true) => Some(permit),
            _ => None,
        }
    }
}

/// Refuses to start the engine on a machine that cannot hold it.
///
/// This is checked once, where the model is about to be loaded, because that
/// is the only moment generation allocates on this scale: the model stays
/// resident afterwards and a second lesson through the same engine asks for
/// nothing more. A refusal here says what is needed and what is free, because
/// the teacher can act on that — closing something — and cannot act on the
/// engine dying halfway through a lesson.
pub(crate) fn ensure_machine_can_hold_engine(
    manifest: ModelManifest,
    reading_photographs: bool,
) -> Result<(), String> {
    let required = memory_the_engine_takes(manifest, reading_photographs);
    let available = available_memory_bytes();
    if available >= required {
        return Ok(());
    }
    Err(format!(
        "graspy needs about {} of free memory to start the lesson engine, and this Mac has about {} free. Close some apps and try again.",
        gigabytes(required),
        gigabytes(available),
    ))
}

/// What holding this model costs: its own bytes plus the room the engine needs
/// around them. The picker states this before a teacher commits to a download,
/// when nothing beside the weights has been installed.
pub(crate) fn memory_required_for(manifest: ModelManifest) -> u64 {
    manifest.byte_size + ENGINE_HEADROOM_BYTES
}

/// What this engine will take, which is the projector's bytes more when one is
/// loaded beside the weights so that photographs can be read.
fn memory_the_engine_takes(manifest: ModelManifest, reading_photographs: bool) -> u64 {
    let projector = match manifest.sight {
        Some(sight) if reading_photographs => sight.byte_size,
        _ => 0,
    };
    memory_required_for(manifest) + projector
}

pub(crate) fn available_memory_bytes() -> u64 {
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    system.available_memory()
}

fn gigabytes(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1_000_000_000.0)
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc as StdArc,
    };

    use super::*;

    /// Lets a queued waiter reach the front of the semaphore before the test
    /// asserts on what it did.
    async fn settle() {
        tokio::task::yield_now().await;
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }

    #[tokio::test]
    async fn the_engine_goes_to_one_job_at_a_time() {
        let queue = StdArc::new(EngineQueue::default());
        let token = CancellationToken::new();
        let first = queue
            .take_slot(&token)
            .await
            .expect("the first job takes the free engine");

        let waiting = tokio::spawn({
            let queue = StdArc::clone(&queue);
            let token = token.clone();
            async move { queue.take_slot(&token).await.is_some() }
        });
        settle().await;
        assert!(!waiting.is_finished(), "the second job must wait its turn");

        drop(first);
        assert!(
            waiting.await.expect("the waiter runs"),
            "the engine passes to the next job when the first lets go",
        );
    }

    #[tokio::test]
    async fn work_stopped_while_it_waited_never_takes_the_engine() {
        let queue = StdArc::new(EngineQueue::default());
        let holder = CancellationToken::new();
        let held = queue.take_slot(&holder).await.expect("holds the engine");

        let stopped = CancellationToken::new();
        let waiting = tokio::spawn({
            let queue = StdArc::clone(&queue);
            let stopped = stopped.clone();
            async move { queue.take_slot(&stopped).await.is_some() }
        });
        settle().await;

        stopped.cancel();
        assert!(
            !waiting.await.expect("the waiter runs"),
            "stopping while queued gives up the turn rather than taking it later",
        );
        drop(held);
    }

    #[tokio::test]
    async fn turns_are_taken_in_the_order_they_were_asked_for() {
        let queue = StdArc::new(EngineQueue::default());
        let token = CancellationToken::new();
        let held = queue.take_slot(&token).await.expect("holds the engine");

        let next = StdArc::new(AtomicUsize::new(0));
        let mut waiters = Vec::new();
        for asked in 1..=3 {
            let queue = StdArc::clone(&queue);
            let token = token.clone();
            let next = StdArc::clone(&next);
            waiters.push(tokio::spawn(async move {
                let permit = queue.take_slot(&token).await.expect("takes its turn");
                let served = next.fetch_add(1, Ordering::SeqCst) + 1;
                drop(permit);
                (asked, served)
            }));
            settle().await;
        }

        drop(held);
        for waiter in waiters {
            let (asked, served) = waiter.await.expect("the waiter runs");
            assert_eq!(
                asked, served,
                "work is served in the order it was asked for"
            );
        }
    }

    #[test]
    fn a_requirement_is_stated_in_units_a_teacher_reads() {
        assert_eq!(gigabytes(4_341_481_184), "4.3 GB");
        assert_eq!(gigabytes(0), "0.0 GB");
    }

    #[test]
    fn the_engine_asks_for_the_model_and_room_to_run_it() {
        let manifest = crate::model_catalogue::default_model().manifest;
        let required = memory_required_for(manifest);
        assert!(
            required > manifest.byte_size,
            "the model's own bytes are not the whole requirement",
        );
        // The developer machines this ships from have far more than this free;
        // the check must pass there or every run would refuse to start.
        assert!(required < 8_000_000_000);
    }

    /// The whole point of a lighter model is that it asks for less. If the
    /// requirement stopped tracking the manifest, the picker would offer a
    /// choice that changes nothing.
    #[test]
    fn a_smaller_model_asks_for_less_memory_than_a_larger_one() {
        let mut requirements: Vec<u64> = crate::model_catalogue::CATALOGUE
            .iter()
            .map(|model| memory_required_for(model.manifest))
            .collect();
        requirements.sort_unstable();
        requirements.dedup();
        assert_eq!(
            requirements.len(),
            crate::model_catalogue::CATALOGUE.len(),
            "two models in the catalogue ask for the same memory",
        );
    }

    /// An engine that will be shown photographs loads a second file, and a
    /// machine that cannot hold both should be told before it starts rather
    /// than while a teacher is waiting on a lesson.
    #[test]
    fn a_projector_counts_towards_what_the_machine_must_hold() {
        let manifest = crate::model_catalogue::CATALOGUE
            .iter()
            .find(|model| model.manifest.sight.is_some())
            .expect("a model that can be shown a photograph")
            .manifest;
        let sight = manifest.sight.expect("its projector");

        assert_eq!(
            memory_the_engine_takes(manifest, true) - memory_the_engine_takes(manifest, false),
            sight.byte_size,
        );
        assert_eq!(
            memory_the_engine_takes(manifest, false),
            memory_required_for(manifest),
        );
    }
}
