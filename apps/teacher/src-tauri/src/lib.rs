mod academic_workspace;
mod class_timetable;
mod classwork;
mod command_answers;
mod content_corpus;
mod content_rights;
mod curriculum_catalog;
mod db;
mod differentiated_classwork;
mod document_export;
pub mod generation_program;
mod inference;
mod launch_health;
mod learner_evidence;
mod lesson_import;
mod lesson_planning;
mod model_acquisition;
mod model_catalogue;
mod scheme_of_work;
mod startup_order;
mod task_registry;

use academic_workspace::{
    add_teaching_assignment, archive_teaching_assignment, create_academic_session,
    create_academic_workspace, get_academic_workspace, set_active_academic_context,
    update_teaching_assignment,
};
use class_timetable::{
    get_class_timetable, get_next_teaching_slot, get_school_day, get_todays_classes,
    set_class_timetable, set_school_day,
};
use classwork::{
    approve_classwork_version, edit_classwork_block, get_classwork_figure,
    get_classwork_section_history, get_classwork_workspace, regenerate_classwork_section,
    restore_classwork_section, run_classwork_generation,
};
use content_corpus::ContentCorpus;
use curriculum_catalog::{
    assign_curriculum_course, get_curriculum_catalog, install_curriculum_package,
};
use db::{Database, DatabaseInitError};
use differentiated_classwork::{
    get_differentiated_classwork_workspace, run_differentiated_classwork_generation,
};
use document_export::{
    prepare_classwork_export, prepare_lesson_plan_export, print_classwork_document,
    print_lesson_plan_document, save_classwork_pdf, save_lesson_plan_pdf,
};
use inference::{
    cancel_lesson_note_completion, cancel_lesson_preparation_completion,
    create_granular_lesson_completion, create_lesson_note_completion,
    create_lesson_preparation_completion, resume_lesson_preparation,
    work_through_teacher_lesson_goals, InferenceRuntime,
};
use launch_health::{LaunchFailure, LaunchFailureCode, LaunchHealth};
use learner_evidence::{get_lesson_evidence_workspace, save_lesson_evidence};
use lesson_import::{
    can_read_a_lesson_plan_photograph, import_lesson_plan_document,
    read_lesson_plan_photograph, stop_reading_lesson_plan_photograph,
};
use lesson_planning::{
    confirm_granular_lesson, discard_lesson, get_granular_lesson_program_input,
    get_lesson_preparation_progress, get_lesson_workspace, move_lesson_draft, save_authored_lesson,
    save_granular_lesson, save_lesson_draft, save_lesson_note,
};
use model_acquisition::{
    cancel_model_acquisition, download_model, download_photograph_reading,
    get_model_installation, get_photograph_reading_installation, import_model,
    import_photograph_reading,
    ModelAcquisitionRuntime,
};
use model_catalogue::{choose_lesson_model, list_lesson_models};
use scheme_of_work::{
    archive_scheme_entry, create_scheme_from_template, create_scheme_of_work,
    get_scheme_of_work_context, install_scheme_template_package, move_scheme_entry,
    save_scheme_entry, save_scheme_week,
};
use task_registry::{
    cancel_background_task, dismiss_background_task, get_background_task, list_background_tasks,
};
use tauri::Manager;

#[tauri::command]
fn launch_health(health: tauri::State<'_, LaunchHealth>) -> Option<LaunchFailure> {
    health.failure()
}

/// Re-run the work that failed at launch, so a teacher who has resolved the
/// cause is not left restarting the app to find out.
#[tauri::command(async)]
fn retry_launch(
    app: tauri::AppHandle,
    health: tauri::State<'_, LaunchHealth>,
) -> Option<LaunchFailure> {
    match initialize_workspace(&app) {
        Ok(()) => {
            health.clear();
            None
        }
        Err(failure) => {
            health.record(failure.clone());
            Some(failure)
        }
    }
}

fn initialize_workspace(app: &tauri::AppHandle) -> Result<(), LaunchFailure> {
    app.state::<Database>()
        .init_from_app(app)
        .map_err(|error| {
            let code = match &error {
                DatabaseInitError::NeedsAppUpdate { .. } => LaunchFailureCode::NeedsAppUpdate,
                DatabaseInitError::Unavailable(_) => LaunchFailureCode::LessonLibraryUnavailable,
            };
            LaunchFailure::new(code, error.to_string())
        })?;
    let database = app.state::<Database>();
    generation_program::repository::recover_interrupted_runs(database.inner()).map_err(
        |error| {
            LaunchFailure::new(
                LaunchFailureCode::InterruptedWorkUnresolved,
                error.to_string(),
            )
        },
    )?;
    task_registry::mark_interrupted_on_startup(database.inner())
        .map_err(|error| LaunchFailure::new(LaunchFailureCode::InterruptedWorkUnresolved, error))?;
    // The source library is read-only and carries nothing from the curriculum
    // packages, so it is opened before them. Installing a package can refuse —
    // one already installed under the same identity with different contents —
    // and a teacher whose lessons come from their own goals should still get
    // source material when that happens.
    app.state::<ContentCorpus>()
        .init_from_app(app)
        .map_err(|error| LaunchFailure::new(LaunchFailureCode::SourceMaterialUnavailable, error))?;
    curriculum_catalog::repository::install_bundled_packages(database.inner(), app).map_err(
        |error| LaunchFailure::new(LaunchFailureCode::IncludedContentUnavailable, error),
    )?;
    scheme_of_work::repository::install_bundled_packages(database.inner(), app).map_err(
        |error| LaunchFailure::new(LaunchFailureCode::IncludedContentUnavailable, error),
    )?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ContentCorpus::default())
        .manage(Database::default())
        .manage(InferenceRuntime::default())
        .manage(ModelAcquisitionRuntime::default())
        .manage(LaunchHealth::default())
        .setup(|app| {
            if let Err(failure) = initialize_workspace(app.handle()) {
                app.state::<LaunchHealth>().record(failure);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            launch_health,
            retry_launch,
            get_curriculum_catalog,
            install_curriculum_package,
            assign_curriculum_course,
            get_model_installation,
            list_lesson_models,
            choose_lesson_model,
            download_model,
            import_model,
            cancel_model_acquisition,
            download_photograph_reading,
            get_photograph_reading_installation,
            import_photograph_reading,
            get_academic_workspace,
            create_academic_workspace,
            create_academic_session,
            add_teaching_assignment,
            update_teaching_assignment,
            archive_teaching_assignment,
            set_active_academic_context,
            get_class_timetable,
            set_class_timetable,
            get_next_teaching_slot,
            get_school_day,
            get_todays_classes,
            set_school_day,
            get_scheme_of_work_context,
            create_scheme_of_work,
            install_scheme_template_package,
            create_scheme_from_template,
            save_scheme_week,
            save_scheme_entry,
            archive_scheme_entry,
            move_scheme_entry,
            get_lesson_workspace,
            get_lesson_preparation_progress,
            get_granular_lesson_program_input,
            save_lesson_draft,
            save_authored_lesson,
            save_granular_lesson,
            save_lesson_note,
            list_background_tasks,
            get_background_task,
            cancel_background_task,
            dismiss_background_task,
            confirm_granular_lesson,
            discard_lesson,
            move_lesson_draft,
            create_lesson_note_completion,
            cancel_lesson_note_completion,
            create_lesson_preparation_completion,
            create_granular_lesson_completion,
            resume_lesson_preparation,
            can_read_a_lesson_plan_photograph,
            import_lesson_plan_document,
            read_lesson_plan_photograph,
            stop_reading_lesson_plan_photograph,
            work_through_teacher_lesson_goals,
            cancel_lesson_preparation_completion,
            get_classwork_workspace,
            run_classwork_generation,
            regenerate_classwork_section,
            get_classwork_figure,
            edit_classwork_block,
            approve_classwork_version,
            get_classwork_section_history,
            restore_classwork_section,
            prepare_classwork_export,
            save_classwork_pdf,
            print_classwork_document,
            prepare_lesson_plan_export,
            save_lesson_plan_pdf,
            print_lesson_plan_document,
            get_lesson_evidence_workspace,
            save_lesson_evidence,
            get_differentiated_classwork_workspace,
            run_differentiated_classwork_generation
        ])
        .build(tauri::generate_context!())
        .expect("failed to build graspy-teacher");

    app.run(|app, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            tauri::async_runtime::block_on(async {
                app.state::<ModelAcquisitionRuntime>().shutdown().await;
                app.state::<InferenceRuntime>().shutdown().await;
            });
        }
    });
}

// The two commands the crate root registers itself.
#[cfg(test)]
pub(crate) fn declare_launch_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<Option<LaunchFailure>>("launch_health");
    answers.of::<Option<LaunchFailure>>("retry_launch");
}
