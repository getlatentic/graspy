//! What each Tauri command answers with, in a form the frontend can be held to.
//!
//! A command has two halves written in two languages: a Rust type serialised
//! here, and a zod schema parsing it there. Nothing made them agree. Three
//! contracts broke in one week with both suites green — a renamed key on a
//! shipped scheme package, a renamed key inside a sealed plan, and a lesson
//! workspace the frontend then refused to read at all — and every one was found
//! by opening the app.
//!
//! Nested types come along: a schema carries every type it references, so
//! naming a command names everything it can send.

#![cfg(test)]

/// Every command's answer, gathered from the modules that own the commands.
///
/// A type is described once and referred to by name, so a shape shared by six
/// commands is one entry to read and one entry to disagree about.
#[derive(Default)]
pub(crate) struct CommandAnswers {
    answers: std::collections::BTreeMap<&'static str, serde_json::Value>,
    types: schemars::SchemaGenerator,
}

impl CommandAnswers {
    /// What one command sends back. `()` is a command that reports only whether
    /// it worked.
    pub(crate) fn of<T: schemars::JsonSchema>(&mut self, command: &'static str) {
        let schema = self.types.subschema_for::<T>();
        let described = serde_json::to_value(schema).expect("a schema serialises");
        self.answers.insert(command, described);
    }

    fn commands(&self) -> std::collections::BTreeSet<&'static str> {
        self.answers.keys().copied().collect()
    }

    fn written_down(mut self) -> String {
        let all = serde_json::json!({
            "answers": self.answers,
            "types": self.types.take_definitions(true),
        });
        format!(
            "{}\n",
            serde_json::to_string_pretty(&all).expect("the answers serialise")
        )
    }
}

/// Where the answers are written down for the frontend's half to be read
/// against. Tracked in git, so the file a test compares to is the file review
/// saw.
const ANSWERS_FILE: &str = "../contracts/command-answers.json";

fn declared() -> CommandAnswers {
    let mut answers = CommandAnswers::default();
    crate::academic_workspace::commands::declare_answers(&mut answers);
    crate::class_timetable::commands::declare_answers(&mut answers);
    crate::classwork::commands::declare_answers(&mut answers);
    crate::curriculum_catalog::commands::declare_answers(&mut answers);
    crate::differentiated_classwork::commands::declare_answers(&mut answers);
    crate::document_export::commands::declare_answers(&mut answers);
    crate::inference::commands::declare_answers(&mut answers);
    crate::learner_evidence::commands::declare_answers(&mut answers);
    crate::lesson_import::commands::declare_answers(&mut answers);
    crate::lesson_planning::commands::declare_answers(&mut answers);
    crate::model_acquisition::commands::declare_answers(&mut answers);
    crate::model_catalogue::commands::declare_answers(&mut answers);
    crate::scheme_of_work::commands::declare_answers(&mut answers);
    crate::task_registry::commands::declare_answers(&mut answers);
    crate::declare_launch_answers(&mut answers);
    answers
}

mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::path::{Path, PathBuf};

    /// A command whose answer nobody wrote down is a command whose two halves
    /// can disagree in silence, which is the whole of this.
    #[test]
    fn every_command_says_what_it_answers_with() {
        assert_eq!(registered_commands(), declared().commands());
    }

    fn registered_commands() -> BTreeSet<&'static str> {
        let source = include_str!("lib.rs");
        let after_opening = source
            .split_once("tauri::generate_handler![")
            .expect("the handler list")
            .1;
        let listed = after_opening
            .split_once(']')
            .expect("the end of the list")
            .0;

        let commands: BTreeSet<&str> = listed
            .split(',')
            .map(str::trim)
            .filter(|command| !command.is_empty())
            .collect();
        assert!(
            commands.len() > 50,
            "the handler list stopped parsing, so nothing below is checking anything"
        );
        commands
    }

    /// serde writes `None` as `null` rather than leaving the key out, so every
    /// optional field is a field the frontend can count on being there.
    /// `skip_serializing_if` would break that quietly — the schema would still
    /// describe the key, and the frontend would still require it, while the
    /// answer arrived without it. The frontend's half reads an optional field as
    /// one that is always sent, so nothing may start.
    #[test]
    fn an_optional_field_is_still_sent() {
        let mut found = Vec::new();
        collect_rust_files(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
            &mut found,
        );

        let skipping: Vec<&PathBuf> = found
            .iter()
            // This file names the attribute in order to forbid it.
            .filter(|path| !path.ends_with("command_answers.rs"))
            .filter(|path| {
                std::fs::read_to_string(path)
                    .expect("a source file")
                    .contains("skip_serializing_if")
            })
            .collect();

        assert!(
            skipping.is_empty(),
            "these leave a key out of the answer, which the frontend's schema still requires: {skipping:?}"
        );
    }

    fn collect_rust_files(directory: &Path, found: &mut Vec<PathBuf>) {
        for entry in std::fs::read_dir(directory).expect("the source tree") {
            let path = entry.expect("a source entry").path();
            if path.is_dir() {
                collect_rust_files(&path, found);
            } else if path.extension().is_some_and(|kind| kind == "rs") {
                found.push(path);
            }
        }
    }

    /// What the frontend is held to, written where its tests can read it.
    #[test]
    fn the_answers_are_written_down_for_the_other_half() {
        let written = declared().written_down();
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(ANSWERS_FILE);
        if std::fs::read_to_string(&path).unwrap_or_default() == written {
            return;
        }

        std::fs::write(&path, &written).expect("the answers file");
        panic!(
            "a command's answer changed, so {} was rewritten. Read the diff, bring the \
             frontend's schema with it, and commit both.",
            path.display()
        );
    }
}
