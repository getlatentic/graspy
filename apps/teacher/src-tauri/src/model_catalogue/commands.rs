use tauri::{AppHandle, Runtime, State};

use crate::{
    db::Database,
    inference::{available_memory_bytes, memory_required_for, InferenceRuntime},
    model_acquisition::is_installed,
};

use super::{domain, domain::LessonModelChoice, repository};

#[tauri::command]
pub async fn list_lesson_models<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
) -> Result<Vec<LessonModelChoice>, String> {
    let selected = repository::selected_model(&database)?;
    let available = available_memory_bytes();

    let mut choices = Vec::new();
    for model in domain::offered_models() {
        let memory_required_bytes = memory_required_for(model.manifest);
        choices.push(LessonModelChoice {
            id: model.manifest.id,
            display_name: model.display_name,
            summary: model.summary,
            download_bytes: model.manifest.byte_size,
            memory_required_bytes,
            fits_this_machine: available >= memory_required_bytes,
            is_installed: is_installed(&app, &database, model.manifest).await,
            is_selected: model.manifest.id == selected.manifest.id,
        });
    }
    Ok(choices)
}

/// Switches which model writes lessons.
///
/// The engine holds one model resident, so a change means the running one is no
/// longer the chosen one. Shutting it down here is what makes the choice real:
/// the next lesson starts an engine on the new model. Work already generating
/// finishes on the model it started with, which is the only honest outcome —
/// a lesson half-written by one model and half by another is neither.
#[tauri::command]
pub async fn choose_lesson_model(
    database: State<'_, Database>,
    inference: State<'_, InferenceRuntime>,
    model_id: String,
) -> Result<(), String> {
    let model = domain::find(&model_id)
        .filter(|model| model.is_offered())
        .ok_or_else(|| "That option is not available on this version of graspy.".to_owned())?;

    if repository::selected_model(&database)?.manifest.id == model.manifest.id {
        return Ok(());
    }

    repository::save_selection(&database, model)?;
    inference.shutdown().await;
    Ok(())
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<()>("choose_lesson_model");
    answers.of::<Vec<LessonModelChoice>>("list_lesson_models");
}
