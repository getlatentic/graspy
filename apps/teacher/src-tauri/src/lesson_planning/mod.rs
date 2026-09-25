pub(crate) mod commands;
pub(crate) mod answer_checking;
mod comparing;
mod counting;
pub(crate) mod domain;
#[cfg(test)]
pub(crate) mod evaluation;
pub mod granular;
mod lesson_prose;
mod mathematics;
mod place_value;
pub(crate) mod preparation_progress;
pub mod program;
mod repository;
pub(crate) mod sealed_plan;
pub(crate) mod teacher_authored;

pub(crate) use repository::{
    discard_teacher_authored_curriculum as discard_teacher_lesson_curriculum,
    load_teacher_goals as load_teacher_lesson_goals,
    save_teacher_authored_curriculum as save_teacher_lesson_curriculum,
};

/// Rebuilds the program input a preparation ran from, so a resume is checked
/// against the same digest the interrupted run recorded.
pub(crate) fn load_granular_program_input(
    database: &crate::db::Database,
    corpus: &crate::content_corpus::ContentCorpus,
    request: domain::GranularLessonProgramInputRequest,
) -> Result<program::GranularLessonProgramInput, String> {
    repository::get_granular_program_input(database, corpus, request)
}

/// Persists a prepared lesson from the backend, so a run that finishes after
/// the screen is gone is still kept.
pub(crate) fn persist_prepared_lesson(
    database: &crate::db::Database,
    request: domain::SaveGranularLessonRequest,
) -> Result<(), String> {
    repository::save_granular_lesson(database, request).map(|_| ())
}

pub use commands::{
    confirm_granular_lesson, discard_lesson, get_granular_lesson_program_input,
    get_lesson_preparation_progress, get_lesson_workspace, move_lesson_draft, save_authored_lesson,
    save_granular_lesson, save_lesson_draft, save_lesson_note,
};
pub(crate) use domain::{LessonContextRequest, CLASSWORK_COMPLETE_SQL};
