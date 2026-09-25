use tauri::{AppHandle, Runtime, State};

use crate::db::Database;

use super::{domain::*, generation, repository};

#[tauri::command]
pub async fn run_differentiated_classwork_generation<R: Runtime>(
    app: AppHandle<R>,
    request: RunDifferentiatedGenerationRequest,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot, String> {
    generation::launch_run(&app, request).await
}

#[tauri::command(async)]
pub fn get_differentiated_classwork_workspace(
    database: State<'_, Database>,
    request: DifferentiatedWorkspaceRequest,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot, String> {
    repository::get_workspace(&database, request)
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers
        .of::<DifferentiatedClassworkWorkspaceSnapshot>("get_differentiated_classwork_workspace");
    answers
        .of::<DifferentiatedClassworkWorkspaceSnapshot>("run_differentiated_classwork_generation");
}
