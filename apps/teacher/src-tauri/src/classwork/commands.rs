use tauri::{AppHandle, Runtime, State};

use crate::{content_corpus::ContentCorpus, db::Database};

use super::{domain::*, generation, repository};

#[tauri::command]
pub async fn run_classwork_generation<R: Runtime>(
    app: AppHandle<R>,
    request: RunClassworkGenerationRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    generation::launch_run(&app, request).await
}

#[tauri::command]
pub async fn regenerate_classwork_section<R: Runtime>(
    app: AppHandle<R>,
    request: BeginClassworkSectionRegenerationRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    generation::launch_regeneration(&app, request).await
}

#[tauri::command(async)]
pub fn get_classwork_workspace(
    database: State<'_, Database>,
    corpus: State<'_, ContentCorpus>,
    request: ClassworkWorkspaceRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    repository::get_workspace(&database, &corpus, request)
}

#[tauri::command(async)]
pub fn get_classwork_figure(
    database: State<'_, Database>,
    corpus: State<'_, ContentCorpus>,
    request: ClassworkFigureRequest,
) -> Result<String, String> {
    repository::figure_data_url(&database, &corpus, request)
}

#[tauri::command(async)]
pub fn edit_classwork_block(
    database: State<'_, Database>,
    request: EditClassworkBlockRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    repository::edit_block(&database, request)
}

#[tauri::command(async)]
pub fn approve_classwork_version(
    database: State<'_, Database>,
    request: ApproveClassworkVersionRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    repository::approve_version(&database, request)
}

#[tauri::command(async)]
pub fn get_classwork_section_history(
    database: State<'_, Database>,
    request: ClassworkSectionHistoryRequest,
) -> Result<ClassworkSectionHistory, String> {
    repository::section_history(&database, request)
}

#[tauri::command(async)]
pub fn restore_classwork_section(
    database: State<'_, Database>,
    request: RestoreClassworkSectionRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    repository::restore_section(&database, request)
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<ClassworkWorkspaceSnapshot>("approve_classwork_version");
    answers.of::<ClassworkWorkspaceSnapshot>("edit_classwork_block");
    answers.of::<String>("get_classwork_figure");
    answers.of::<ClassworkSectionHistory>("get_classwork_section_history");
    answers.of::<ClassworkWorkspaceSnapshot>("get_classwork_workspace");
    answers.of::<ClassworkWorkspaceSnapshot>("regenerate_classwork_section");
    answers.of::<ClassworkWorkspaceSnapshot>("restore_classwork_section");
    answers.of::<ClassworkWorkspaceSnapshot>("run_classwork_generation");
}
