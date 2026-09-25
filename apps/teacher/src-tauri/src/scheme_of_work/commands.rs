use tauri::State;

use crate::db::Database;

use super::{
    domain::{
        ArchiveSchemeEntryRequest, CreateSchemeFromTemplateRequest, CreateSchemeOfWorkRequest,
        InstallSchemeTemplatePackageRequest, MoveSchemeEntryRequest, SaveSchemeEntryRequest,
        SaveSchemeWeekRequest, SchemeContextRequest, SchemeContextSnapshot,
    },
    repository,
};

#[tauri::command(async)]
pub fn get_scheme_of_work_context(
    database: State<'_, Database>,
    request: SchemeContextRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::get_context(&database, request)
}

#[tauri::command(async)]
pub fn create_scheme_of_work(
    database: State<'_, Database>,
    request: CreateSchemeOfWorkRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::create_scheme(&database, request)
}

#[tauri::command(async)]
pub fn install_scheme_template_package(
    database: State<'_, Database>,
    request: InstallSchemeTemplatePackageRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::install_template_package(&database, request)
}

#[tauri::command(async)]
pub fn create_scheme_from_template(
    database: State<'_, Database>,
    request: CreateSchemeFromTemplateRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::create_scheme_from_template(&database, request)
}

#[tauri::command(async)]
pub fn save_scheme_week(
    database: State<'_, Database>,
    request: SaveSchemeWeekRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::save_week(&database, request)
}

#[tauri::command(async)]
pub fn save_scheme_entry(
    database: State<'_, Database>,
    request: SaveSchemeEntryRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::save_entry(&database, request)
}

#[tauri::command(async)]
pub fn move_scheme_entry(
    database: State<'_, Database>,
    request: MoveSchemeEntryRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::move_entry(&database, request)
}

#[tauri::command(async)]
pub fn archive_scheme_entry(
    database: State<'_, Database>,
    request: ArchiveSchemeEntryRequest,
) -> Result<SchemeContextSnapshot, String> {
    repository::archive_entry(&database, request)
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<SchemeContextSnapshot>("archive_scheme_entry");
    answers.of::<SchemeContextSnapshot>("create_scheme_from_template");
    answers.of::<SchemeContextSnapshot>("create_scheme_of_work");
    answers.of::<SchemeContextSnapshot>("get_scheme_of_work_context");
    answers.of::<SchemeContextSnapshot>("install_scheme_template_package");
    answers.of::<SchemeContextSnapshot>("move_scheme_entry");
    answers.of::<SchemeContextSnapshot>("save_scheme_entry");
    answers.of::<SchemeContextSnapshot>("save_scheme_week");
}
