use serde::Serialize;

/// The lifecycle every background task moves through. `Queued` and `Running`
/// are the live states — queued work is recorded and cancellable but has not
/// reached the engine — and everything else is terminal except `Interrupted`,
/// which marks work the app was closed under and which can be resumed or
/// cancelled.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Queued,
    Running,
    Interrupted,
    Succeeded,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Queued => "queued",
            TaskStatus::Running => "running",
            TaskStatus::Interrupted => "interrupted",
            TaskStatus::Succeeded => "succeeded",
            TaskStatus::Failed => "failed",
            TaskStatus::Cancelled => "cancelled",
        }
    }

    pub(super) fn parse(value: &str) -> Result<Self, String> {
        match value {
            "queued" => Ok(TaskStatus::Queued),
            "running" => Ok(TaskStatus::Running),
            "interrupted" => Ok(TaskStatus::Interrupted),
            "succeeded" => Ok(TaskStatus::Succeeded),
            "failed" => Ok(TaskStatus::Failed),
            "cancelled" => Ok(TaskStatus::Cancelled),
            other => Err(format!("The saved task status is invalid: {other}")),
        }
    }
}

/// How a finished task ended, decided by the code that ran it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskOutcome {
    Succeeded,
    Failed,
    Cancelled,
}

impl TaskOutcome {
    pub(super) fn status(self) -> TaskStatus {
        match self {
            TaskOutcome::Succeeded => TaskStatus::Succeeded,
            TaskOutcome::Failed => TaskStatus::Failed,
            TaskOutcome::Cancelled => TaskStatus::Cancelled,
        }
    }
}

/// A task as every screen sees it: what it is working on, how far it has got,
/// and how it ended if it has.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTask {
    pub id: String,
    pub kind: String,
    pub lesson_id: String,
    pub label: String,
    pub status: TaskStatus,
    /// Place in line, counted across every class, for queued work only.
    pub queue_position: Option<i64>,
    pub failure_message: Option<String>,
    pub started_at: String,
    pub updated_at: String,
    pub finished_at: Option<String>,
    /// When the teacher put this away, for work that has ended.
    pub dismissed_at: Option<String>,
}

/// What a flow supplies when it registers work it is about to run.
#[derive(Debug, Clone)]
pub struct NewTask {
    pub id: String,
    pub kind: String,
    pub academic_session_id: String,
    pub academic_period_id: String,
    pub teaching_assignment_id: String,
    pub lesson_id: String,
    pub label: String,
}
