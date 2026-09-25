use std::path::PathBuf;

use tauri::{AppHandle, Runtime, State};

use crate::db::Database;

use super::{
    domain::{AcquisitionError, ModelInstallationSnapshot},
    service::ModelAcquisitionRuntime,
};

#[tauri::command]
pub async fn get_model_installation<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, ModelAcquisitionRuntime>,
) -> Result<ModelInstallationSnapshot, AcquisitionError> {
    runtime.reconcile(&app, &database).await
}

#[tauri::command]
pub async fn download_model<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, ModelAcquisitionRuntime>,
    request_id: String,
) -> Result<ModelInstallationSnapshot, AcquisitionError> {
    runtime.download(&app, &database, &request_id).await
}

#[tauri::command]
pub async fn import_model<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, ModelAcquisitionRuntime>,
    request_id: String,
    source_path: String,
) -> Result<ModelInstallationSnapshot, AcquisitionError> {
    runtime
        .import(&app, &database, &request_id, &PathBuf::from(source_path))
        .await
}

/// How far the file that lets the model read a photograph has got.
#[tauri::command]
pub async fn get_photograph_reading_installation<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, ModelAcquisitionRuntime>,
) -> Result<ModelInstallationSnapshot, AcquisitionError> {
    runtime.reconcile_sight(&app, &database).await
}

/// Fetches it, resuming where a previous attempt left off.
#[tauri::command]
pub async fn download_photograph_reading<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, ModelAcquisitionRuntime>,
    request_id: String,
) -> Result<ModelInstallationSnapshot, AcquisitionError> {
    runtime.download_sight(&app, &database, &request_id).await
}

/// Takes it off a stick, for a school with no connection to fetch it over.
#[tauri::command]
pub async fn import_photograph_reading<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, ModelAcquisitionRuntime>,
    request_id: String,
    source_path: String,
) -> Result<ModelInstallationSnapshot, AcquisitionError> {
    runtime
        .import_sight(&app, &database, &request_id, &PathBuf::from(source_path))
        .await
}

#[tauri::command]
pub async fn cancel_model_acquisition(
    runtime: State<'_, ModelAcquisitionRuntime>,
    request_id: String,
) -> Result<(), AcquisitionError> {
    runtime.cancel(&request_id).await;
    Ok(())
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<()>("cancel_model_acquisition");
    answers.of::<ModelInstallationSnapshot>("download_model");
    answers.of::<ModelInstallationSnapshot>("download_photograph_reading");
    answers.of::<ModelInstallationSnapshot>("get_model_installation");
    answers.of::<ModelInstallationSnapshot>("get_photograph_reading_installation");
    answers.of::<ModelInstallationSnapshot>("import_model");
    answers.of::<ModelInstallationSnapshot>("import_photograph_reading");
}
