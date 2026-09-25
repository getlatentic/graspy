use tauri::State;

use crate::{content_corpus::ContentCorpus, db::Database};

use super::{
    domain::{
        ConfirmGranularLessonRequest, DiscardLessonRequest, GranularLessonProgramInputRequest,
        LessonContextRequest, LessonWorkspaceRequest, LessonWorkspaceSnapshot,
        MoveLessonDraftRequest, SaveAuthoredLessonRequest, SaveGranularLessonRequest,
        SaveLessonDraftRequest,
    },
    preparation_progress::{self, PreparationStepProgress},
    program::GranularLessonProgramInput,
    repository,
};

#[tauri::command(async)]
pub fn get_lesson_workspace(
    database: State<'_, Database>,
    request: LessonWorkspaceRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    repository::get_context(&database, request)
}

#[tauri::command(async)]
pub fn get_granular_lesson_program_input(
    database: State<'_, Database>,
    corpus: State<'_, ContentCorpus>,
    request: GranularLessonProgramInputRequest,
) -> Result<GranularLessonProgramInput, String> {
    repository::get_granular_program_input(&database, &corpus, request)
}

#[tauri::command(async)]
pub fn save_granular_lesson(
    database: State<'_, Database>,
    request: SaveGranularLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    repository::save_granular_lesson(&database, request)
}

#[tauri::command(async)]
pub fn confirm_granular_lesson(
    database: State<'_, Database>,
    request: ConfirmGranularLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    repository::confirm_granular_lesson(&database, request)
}

#[tauri::command(async)]
pub fn save_lesson_draft(
    database: State<'_, Database>,
    request: SaveLessonDraftRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    repository::save_draft(&database, request)
}

#[tauri::command(async)]
pub fn save_authored_lesson(
    database: State<'_, Database>,
    request: SaveAuthoredLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    repository::save_authored_lesson(&database, request)
}

#[tauri::command(async)]
pub fn save_lesson_note(
    database: State<'_, Database>,
    context: LessonContextRequest,
    lesson_id: String,
    paragraphs: Vec<String>,
    written_from_version: i64,
) -> Result<(), String> {
    repository::save_note(
        &database,
        &context,
        &lesson_id,
        &paragraphs,
        written_from_version,
    )
}

#[tauri::command(async)]
pub fn discard_lesson(
    database: State<'_, Database>,
    request: DiscardLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    repository::discard_lesson(&database, request)
}

#[tauri::command(async)]
pub fn move_lesson_draft(
    database: State<'_, Database>,
    request: MoveLessonDraftRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    repository::move_draft(&database, request)
}

/// How far the lesson a teacher is waiting on has got.
///
/// Keyed by the request id they already hold, which is the same handle they
/// would cancel with, so watching a run needs nothing the caller did not have.
/// A handle with no run reports an empty sequence rather than an error: asking
/// early, or after the answer has arrived, is not a fault.
#[tauri::command(async)]
pub fn get_lesson_preparation_progress(
    database: State<'_, Database>,
    request_id: String,
) -> Result<Vec<PreparationStepProgress>, String> {
    let nodes = crate::generation_program::repository::load_progress(&database, &request_id)
        .map_err(|fault| fault.to_string())?;
    Ok(preparation_progress::summarise(&nodes))
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<LessonWorkspaceSnapshot>("confirm_granular_lesson");
    answers.of::<LessonWorkspaceSnapshot>("discard_lesson");
    answers.of::<GranularLessonProgramInput>("get_granular_lesson_program_input");
    answers.of::<Vec<PreparationStepProgress>>("get_lesson_preparation_progress");
    answers.of::<LessonWorkspaceSnapshot>("get_lesson_workspace");
    answers.of::<LessonWorkspaceSnapshot>("move_lesson_draft");
    answers.of::<LessonWorkspaceSnapshot>("save_authored_lesson");
    answers.of::<LessonWorkspaceSnapshot>("save_granular_lesson");
    answers.of::<LessonWorkspaceSnapshot>("save_lesson_draft");
    answers.of::<()>("save_lesson_note");
}
