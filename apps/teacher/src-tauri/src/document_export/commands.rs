use tauri::{AppHandle, State};

use crate::{content_corpus::ContentCorpus, db::Database};

use super::{domain::*, pdf, plan_html, service};

#[tauri::command(async)]
pub fn prepare_classwork_export(
    database: State<'_, Database>,
    corpus: State<'_, ContentCorpus>,
    request: PrepareClassworkExportRequest,
) -> Result<PreparedClassworkExport, String> {
    service::prepare(&database, &corpus, request)
}

#[tauri::command(async)]
pub fn save_classwork_pdf(
    database: State<'_, Database>,
    corpus: State<'_, ContentCorpus>,
    app: AppHandle,
    request: SaveClassworkPdfRequest,
) -> Result<ClassworkPdfArtifact, String> {
    let prepared = service::prepare(&database, &corpus, request.document)?;
    let bytes = pdf::html_to_pdf(&app, &prepared.html)?;
    let byte_size = pdf::save_pdf_atomic(&request.destination_path, &bytes)?;
    Ok(ClassworkPdfArtifact {
        path: request.destination_path,
        file_name: prepared.file_name,
        byte_size,
    })
}

#[tauri::command(async)]
pub fn print_classwork_document(
    database: State<'_, Database>,
    corpus: State<'_, ContentCorpus>,
    app: AppHandle,
    request: PrepareClassworkExportRequest,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let prepared = service::prepare(&database, &corpus, request)?;
        let bytes = pdf::html_to_pdf(&app, &prepared.html)?;
        pdf::print_pdf(&app, bytes)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (database, corpus, app, request);
        Err("Native printing is not available on this operating system yet.".to_owned())
    }
}

#[tauri::command(async)]
pub fn prepare_lesson_plan_export(
    input: LessonPlanExportInput,
) -> Result<PreparedClassworkExport, String> {
    let html = plan_html::render_plan(&input)?;
    Ok(PreparedClassworkExport {
        title: input.title.clone(),
        file_name: format!("{}.pdf", service::file_slug(&input.title)),
        html,
    })
}

#[tauri::command(async)]
pub fn save_lesson_plan_pdf(
    app: AppHandle,
    request: SaveLessonPlanPdfRequest,
) -> Result<ClassworkPdfArtifact, String> {
    let html = plan_html::render_plan(&request.document)?;
    let bytes = pdf::html_to_pdf(&app, &html)?;
    let byte_size = pdf::save_pdf_atomic(&request.destination_path, &bytes)?;
    Ok(ClassworkPdfArtifact {
        file_name: format!("{}.pdf", service::file_slug(&request.document.title)),
        path: request.destination_path,
        byte_size,
    })
}

#[tauri::command(async)]
pub fn print_lesson_plan_document(
    app: AppHandle,
    input: LessonPlanExportInput,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let html = plan_html::render_plan(&input)?;
        let bytes = pdf::html_to_pdf(&app, &html)?;
        pdf::print_pdf(&app, bytes)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, input);
        Err("Native printing is not available on this operating system yet.".to_owned())
    }
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<PreparedClassworkExport>("prepare_classwork_export");
    answers.of::<PreparedClassworkExport>("prepare_lesson_plan_export");
    answers.of::<()>("print_classwork_document");
    answers.of::<()>("print_lesson_plan_document");
    answers.of::<ClassworkPdfArtifact>("save_classwork_pdf");
    answers.of::<ClassworkPdfArtifact>("save_lesson_plan_pdf");
}
