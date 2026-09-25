use tauri::State;

use crate::academic_workspace::{
    domain::AcademicWorkspaceSnapshot, repository as academic_repository,
};
use crate::db::Database;

use super::{
    domain::{
        AssignCurriculumCourseRequest, CurriculumCatalogSnapshot, InstallCurriculumPackageRequest,
    },
    repository,
};

#[tauri::command(async)]
pub fn get_curriculum_catalog(
    database: State<'_, Database>,
) -> Result<CurriculumCatalogSnapshot, String> {
    repository::get_catalog(&database)
}

#[tauri::command(async)]
pub fn install_curriculum_package(
    database: State<'_, Database>,
    request: InstallCurriculumPackageRequest,
) -> Result<CurriculumCatalogSnapshot, String> {
    repository::install_package(&database, request)
}

#[tauri::command(async)]
pub fn assign_curriculum_course(
    database: State<'_, Database>,
    request: AssignCurriculumCourseRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    repository::assign_course(&database, request)?;
    academic_repository::get_snapshot(&database)
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<AcademicWorkspaceSnapshot>("assign_curriculum_course");
    answers.of::<CurriculumCatalogSnapshot>("get_curriculum_catalog");
    answers.of::<CurriculumCatalogSnapshot>("install_curriculum_package");
}
