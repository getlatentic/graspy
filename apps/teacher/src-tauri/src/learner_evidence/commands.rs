use tauri::State;

use crate::db::Database;

use super::{domain::*, repository};

#[tauri::command(async)]
pub fn get_lesson_evidence_workspace(
    database: State<'_, Database>,
    request: LessonEvidenceWorkspaceRequest,
) -> Result<LessonEvidenceWorkspaceSnapshot, String> {
    repository::get_workspace(&database, request)
}

#[tauri::command(async)]
pub fn save_lesson_evidence(
    database: State<'_, Database>,
    request: SaveLessonEvidenceRequest,
) -> Result<LessonEvidenceWorkspaceSnapshot, String> {
    repository::save(&database, request)
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<LessonEvidenceWorkspaceSnapshot>("get_lesson_evidence_workspace");
    answers.of::<LessonEvidenceWorkspaceSnapshot>("save_lesson_evidence");
}
