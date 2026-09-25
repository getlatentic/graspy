//! What stopped graspy from opening, in terms a teacher can act on.
//!
//! `initialize_workspace` stops at its first failing step, and which step failed
//! decides what the teacher is told. The code is attached where the failure
//! happens rather than recovered afterwards by reading the message, so the
//! wording of an error can change without changing what the teacher is shown.

use std::sync::Mutex;

use serde::Serialize;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchFailureCode {
    NeedsAppUpdate,
    LessonLibraryUnavailable,
    InterruptedWorkUnresolved,
    SourceMaterialUnavailable,
    IncludedContentUnavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, schemars::JsonSchema)]
pub struct LaunchFailure {
    pub code: LaunchFailureCode,
    pub detail: String,
}

impl LaunchFailure {
    pub fn new(code: LaunchFailureCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
}

#[derive(Default)]
pub struct LaunchHealth(Mutex<Option<LaunchFailure>>);

impl LaunchHealth {
    pub fn record(&self, failure: LaunchFailure) {
        eprintln!(
            "graspy launch failure ({:?}): {}",
            failure.code, failure.detail
        );
        if let Ok(mut slot) = self.0.lock() {
            *slot = Some(failure);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut slot) = self.0.lock() {
            *slot = None;
        }
    }

    pub fn failure(&self) -> Option<LaunchFailure> {
        self.0.lock().ok().and_then(|slot| slot.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_healthy_launch_reports_no_failure() {
        assert_eq!(LaunchHealth::default().failure(), None);
    }

    #[test]
    fn a_recorded_failure_keeps_its_code_and_detail() {
        let health = LaunchHealth::default();

        health.record(LaunchFailure::new(
            LaunchFailureCode::NeedsAppUpdate,
            "library version 25, this app supports up to 24",
        ));

        let failure = health.failure().expect("a recorded failure");
        assert_eq!(failure.code, LaunchFailureCode::NeedsAppUpdate);
        assert!(failure.detail.contains("supports up to 24"));
    }

    #[test]
    fn a_successful_retry_clears_the_recorded_failure() {
        let health = LaunchHealth::default();
        health.record(LaunchFailure::new(
            LaunchFailureCode::IncludedContentUnavailable,
            "refused",
        ));

        health.clear();

        assert_eq!(health.failure(), None);
    }

    #[test]
    fn the_code_crosses_the_boundary_as_a_stable_name() {
        let failure = LaunchFailure::new(LaunchFailureCode::SourceMaterialUnavailable, "detail");

        let encoded = serde_json::to_string(&failure).expect("serialisable failure");

        assert!(encoded.contains("\"source-material-unavailable\""));
    }
}
