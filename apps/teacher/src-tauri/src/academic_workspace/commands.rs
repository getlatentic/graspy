use tauri::State;

use crate::db::Database;

use super::{
    domain::{
        AcademicWorkspaceSnapshot, CreateAcademicSessionRequest, CreateAcademicWorkspaceRequest,
        SaveTeachingAssignmentRequest, SetActiveAcademicContextRequest,
        UpdateTeachingAssignmentRequest,
    },
    repository,
};

#[tauri::command(async)]
pub fn get_academic_workspace(
    database: State<'_, Database>,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::get_snapshot(&database)
}

#[tauri::command(async)]
pub fn create_academic_workspace(
    database: State<'_, Database>,
    request: CreateAcademicWorkspaceRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::create_workspace(&database, request)
}

#[tauri::command(async)]
pub fn create_academic_session(
    database: State<'_, Database>,
    request: CreateAcademicSessionRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::create_session(&database, request)
}

#[tauri::command(async)]
pub fn add_teaching_assignment(
    database: State<'_, Database>,
    request: SaveTeachingAssignmentRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::add_assignment(&database, request)
}

#[tauri::command(async)]
pub fn update_teaching_assignment(
    database: State<'_, Database>,
    request: UpdateTeachingAssignmentRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::update_assignment(&database, request)
}

#[tauri::command(async)]
pub fn archive_teaching_assignment(
    database: State<'_, Database>,
    assignment_id: String,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::archive_assignment(&database, &assignment_id)
}

#[tauri::command(async)]
pub fn set_active_academic_context(
    database: State<'_, Database>,
    request: SetActiveAcademicContextRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::set_active_context(&database, request)
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<AcademicWorkspaceSnapshot>("add_teaching_assignment");
    answers.of::<AcademicWorkspaceSnapshot>("archive_teaching_assignment");
    answers.of::<AcademicWorkspaceSnapshot>("create_academic_session");
    answers.of::<AcademicWorkspaceSnapshot>("create_academic_workspace");
    answers.of::<AcademicWorkspaceSnapshot>("get_academic_workspace");
    answers.of::<AcademicWorkspaceSnapshot>("set_active_academic_context");
    answers.of::<AcademicWorkspaceSnapshot>("update_teaching_assignment");
}
