//! Which model writes a teacher's lessons.
//!
//! Three things live here and nothing else: the models graspy knows how to run,
//! the evidence that each one produces lessons worth giving a class, and the
//! teacher's choice between them. Fetching a model file and proving it arrived
//! intact is `model_acquisition`; running it is `inference`. Both take a
//! manifest as an argument, so neither decides which model that is.
//!
//! The choice is deliberately narrow. A model is offered only once it has
//! passed the same qualification against the same packaged case, so choosing
//! the lighter option trades speed and memory for lesson depth — never for a
//! lesson that has not been checked.

pub(crate) mod commands;
mod domain;
mod repository;

pub use commands::{choose_lesson_model, list_lesson_models};
pub use domain::{ModelFile, ModelManifest};
pub(crate) use repository::{selected_model, selected_model_identity};

/// Reachable so that other modules' tests, and the qualification harness that
/// has to name the model it is scoring, work against the real catalogue rather
/// than a second copy of it that could drift.
#[cfg(test)]
pub(crate) use domain::{default_model, find, LessonModel, CATALOGUE};
