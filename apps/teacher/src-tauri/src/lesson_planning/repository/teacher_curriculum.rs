use rusqlite::{params, OptionalExtension};

use crate::db::Database;

use super::{goals_fingerprint, resolve_context, RepositoryError};
use crate::lesson_planning::domain::LessonContextRequest;
use crate::lesson_planning::granular::CurriculumSnapshot;

/// The goals a teacher wrote for a lesson that has no curriculum behind it.
pub(crate) fn load_teacher_goals(
    database: &Database,
    context: &LessonContextRequest,
    lesson_id: &str,
) -> Result<TeacherAuthoredGoals, String> {
    database.with_connection(|connection| {
        let context = resolve_context(connection, context)?;
        connection
            .query_row(
                "SELECT topic, subtopic, learning_goals
                 FROM lessons
                 WHERE id = ?1 AND academic_period_id = ?2 AND teaching_assignment_id = ?3
                   AND status = 'draft' AND curriculum_course_id IS NULL",
                params![lesson_id, context.period_id, context.assignment_id],
                |row| {
                    Ok(TeacherAuthoredGoals {
                        topic: row.get(0)?,
                        subtopic: row.get(1)?,
                        learning_goals: row.get(2)?,
                    })
                },
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::Conflict("Choose a draft lesson to prepare.".to_owned())
            })
    })
}

pub(crate) struct TeacherAuthoredGoals {
    pub topic: String,
    pub subtopic: Option<String>,
    pub learning_goals: String,
}

/// Keeps the curriculum derived from a teacher's goals, replacing whatever was
/// derived before, so that working a lesson through again is safe to repeat.
pub(crate) fn save_teacher_authored_curriculum(
    database: &Database,
    lesson_id: &str,
    learning_goals: &str,
    snapshot: &CurriculumSnapshot,
    source_record_ids: &[String],
) -> Result<(), String> {
    let snapshot = serde_json::to_string(snapshot).map_err(|error| error.to_string())?;
    let source_record_ids =
        serde_json::to_string(source_record_ids).map_err(|error| error.to_string())?;
    let fingerprint = goals_fingerprint(learning_goals);
    database.with_connection(move |connection| {
        connection.execute(
            "INSERT INTO lesson_teacher_curriculum
                 (lesson_id, goals_fingerprint, snapshot, source_record_ids)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(lesson_id) DO UPDATE SET
                 goals_fingerprint = excluded.goals_fingerprint,
                 snapshot = excluded.snapshot,
                 source_record_ids = excluded.source_record_ids",
            params![lesson_id, fingerprint, snapshot, source_record_ids],
        )?;
        Ok::<(), RepositoryError>(())
    })
}

/// Lets go of a curriculum derived for a lesson that was never prepared from it.
///
/// A derived curriculum is kept so that preparing a lesson again does not repeat
/// the work of reading the teacher's goals. It earns that place by producing a
/// lesson; until it has, a scope that preparation rejected is discarded rather
/// than served again, which would skip working the goals through and reach the
/// same rejection.
pub(crate) fn discard_teacher_authored_curriculum(
    database: &Database,
    context: &LessonContextRequest,
    lesson_id: &str,
) -> Result<(), String> {
    database.with_connection(|connection| {
        let context = resolve_context(connection, context)?;
        connection.execute(
            "DELETE FROM lesson_teacher_curriculum
             WHERE lesson_id IN (
                 SELECT id FROM lessons
                 WHERE id = ?1 AND academic_period_id = ?2 AND teaching_assignment_id = ?3
                   AND curriculum_course_id IS NULL
             )",
            params![lesson_id, context.period_id, context.assignment_id],
        )?;
        Ok::<(), RepositoryError>(())
    })
}

#[cfg(test)]
mod tests {
    use crate::lesson_planning::repository::program_input::{
        get_granular_program_input, load_granular_scope,
    };
    use crate::lesson_planning::repository::test_support::{setup, teacher_authored_lesson};

    fn derived_snapshot() -> crate::lesson_planning::granular::CurriculumSnapshot {
        use crate::lesson_planning::granular::{
            AtomicObjective, BloomLevel, CurriculumObjectiveRef, CurriculumSnapshot,
            KnowledgeComponent, KnowledgeType,
        };
        CurriculumSnapshot {
            package_id: None,
            package_title: None,
            package_sha256: None,
            course_id: None,
            curriculum_node_id: None,
            objectives: vec![CurriculumObjectiveRef {
                id: "teacher-objective-1".to_owned(),
                statement: "Compare two fractions using visual models.".to_owned(),
                sequence: 1,
            }],
            atomic_objectives: vec![AtomicObjective {
                id: "teacher-atomic-objective-1".to_owned(),
                curriculum_objective_id: "teacher-objective-1".to_owned(),
                statement: "Compare two fractions using visual models.".to_owned(),
                bloom_verb: "compare".to_owned(),
                bloom_level: BloomLevel::Understand,
                sequence: 1,
            }],
            knowledge_components: vec![KnowledgeComponent {
                id: "teacher-knowledge-1".to_owned(),
                description: "A common denominator lets two fractions be compared.".to_owned(),
                knowledge_type: KnowledgeType::Procedure,
                bloom_level: BloomLevel::Apply,
                atomic_objective_ids: vec!["teacher-atomic-objective-1".to_owned()],
                prerequisite_knowledge_component_ids: vec![],
                supporting_record_ids: vec!["record-1".to_owned()],
                source_form: None,
                target_form: None,
                is_prior_knowledge: false,
            }],
        }
    }

    /// The corpus keeps only the first twelve excerpts. On the failing run the
    /// three knowledge components cited ch01-b035 upward, the scheme entry held
    /// ch01-b001 upward, and sorting the whole list spent the budget on the
    /// entry — leaving assessments citing evidence the run never received.

    #[test]
    fn a_lesson_with_no_curriculum_is_prepared_against_the_one_derived_from_its_goals() {
        let context = setup();
        let lesson_id = teacher_authored_lesson(&context);
        let goals = serde_json::to_string(&["Compare two fractions using visual models."])
            .expect("encoded goals");

        super::save_teacher_authored_curriculum(
            &context.database,
            &lesson_id,
            &goals,
            &derived_snapshot(),
            &["record-1".to_owned()],
        )
        .expect("the derived curriculum is kept with the lesson");

        let scope = context
            .database
            .with_connection(|connection| {
                let resolved = super::resolve_context(connection, &context.lesson_context)?;
                load_granular_scope(connection, &resolved, &lesson_id)
            })
            .expect("the lesson is prepared against its derived curriculum");

        assert_eq!(scope.topic, "Equivalent fractions");
        assert!(
            scope.curriculum_snapshot.package_id.is_none(),
            "there is no curriculum package to name"
        );
        assert_eq!(scope.source_record_ids, vec!["record-1".to_owned()]);
        assert_eq!(
            scope.curriculum_snapshot.atomic_objectives[0].bloom_verb,
            "compare"
        );
    }

    /// A scope that produced no lesson is let go, so the next attempt works the
    /// goals through again instead of being served the one that already failed.

    #[test]
    fn a_derived_curriculum_no_lesson_was_prepared_from_is_discarded() {
        let context = setup();
        let lesson_id = teacher_authored_lesson(&context);
        let goals = serde_json::to_string(&["Compare two fractions using visual models."])
            .expect("encoded goals");
        super::save_teacher_authored_curriculum(
            &context.database,
            &lesson_id,
            &goals,
            &derived_snapshot(),
            &["record-1".to_owned()],
        )
        .expect("the derived curriculum is kept with the lesson");

        super::discard_teacher_authored_curriculum(
            &context.database,
            &context.lesson_context,
            &lesson_id,
        )
        .expect("the unproven curriculum is let go");

        let scope = context.database.with_connection(|connection| {
            let resolved = super::resolve_context(connection, &context.lesson_context)?;
            load_granular_scope(connection, &resolved, &lesson_id)
        });

        assert!(
            scope.is_err(),
            "the lesson asks for its goals to be worked through again"
        );
    }

    /// A lesson in another class or term is not this one, and its derived
    /// curriculum survives a failure that was never about it.

    #[test]
    fn discarding_a_derived_curriculum_leaves_another_lessons_alone() {
        let context = setup();
        let lesson_id = teacher_authored_lesson(&context);
        let goals = serde_json::to_string(&["Compare two fractions using visual models."])
            .expect("encoded goals");
        super::save_teacher_authored_curriculum(
            &context.database,
            &lesson_id,
            &goals,
            &derived_snapshot(),
            &["record-1".to_owned()],
        )
        .expect("the derived curriculum is kept with the lesson");

        super::discard_teacher_authored_curriculum(
            &context.database,
            &context.lesson_context,
            "a-lesson-that-is-not-this-one",
        )
        .expect("discarding another lesson is not an error");

        let scope = context
            .database
            .with_connection(|connection| {
                let resolved = super::resolve_context(connection, &context.lesson_context)?;
                load_granular_scope(connection, &resolved, &lesson_id)
            })
            .expect("this lesson keeps its derived curriculum");

        assert_eq!(scope.source_record_ids, vec!["record-1".to_owned()]);
    }

    /// The whole teacher-authored journey across every layer it touches: a lesson
    /// typed with no curriculum behind it, the installed library searched for what
    /// was written, the model asked what it teaches against, the result kept, and
    /// a program input the pipeline will accept coming back out.
    #[tokio::test]
    #[ignore = "requires a qualified local llama-server; set GRASPY_LLAMA_BASE_URL"]
    async fn a_typed_lesson_reaches_a_program_input_the_pipeline_accepts() {
        let base_url = std::env::var("GRASPY_LLAMA_BASE_URL")
            .expect("GRASPY_LLAMA_BASE_URL must identify a running local server");
        let context = setup();
        let lesson_id = teacher_authored_lesson(&context);
        let goals = vec!["Compare two fractions using visual models.".to_owned()];

        let corpus = crate::content_corpus::ContentCorpus::default();
        corpus
            .init_at(std::path::Path::new(
                "resources/content/siyavula-jss1-mathematics-v1/corpus.sqlite3",
            ))
            .expect("the bundled source library opens");
        let phrases = crate::lesson_planning::teacher_authored::retrieval_phrases(
            "Equivalent fractions",
            None,
            &goals,
        );
        let records = corpus
            .find_source_material(&phrases, 5)
            .expect("sources for what the teacher wrote");
        let drafted = crate::lesson_planning::teacher_authored::derive_teaching_ground(
            &base_url,
            "Equivalent fractions",
            None,
            &goals,
            &records,
        )
        .await
        .expect("the model classifies the goals");
        let snapshot = crate::lesson_planning::teacher_authored::curriculum_snapshot_from_goals(
            &goals, &records, &drafted,
        )
        .expect("a derived curriculum");

        super::save_teacher_authored_curriculum(
            &context.database,
            &lesson_id,
            &serde_json::to_string(&goals).expect("encoded goals"),
            &snapshot,
            &records
                .iter()
                .map(|record| record.record_id.clone())
                .collect::<Vec<_>>(),
        )
        .expect("the derived curriculum is kept with the lesson");

        let input = get_granular_program_input(
            &context.database,
            &corpus,
            crate::lesson_planning::domain::GranularLessonProgramInputRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
                lesson_duration_minutes: 40,
            },
        )
        .expect("a lesson with no curriculum still reaches a valid program input");

        assert_eq!(input.topic, "Equivalent fractions");
        assert!(input.curriculum_snapshot.package_id.is_none());
        assert!(!input.source_evidence_snapshot.records.is_empty());
        input.validate().expect("the pipeline accepts it");
    }

    #[test]
    fn goals_edited_after_the_curriculum_was_derived_send_the_lesson_back() {
        let context = setup();
        let lesson_id = teacher_authored_lesson(&context);

        super::save_teacher_authored_curriculum(
            &context.database,
            &lesson_id,
            &serde_json::to_string(&["An earlier goal the teacher has since replaced."])
                .expect("encoded goals"),
            &derived_snapshot(),
            &["record-1".to_owned()],
        )
        .expect("a derived curriculum from the earlier goals");

        let error = context
            .database
            .with_connection(|connection| {
                let resolved = super::resolve_context(connection, &context.lesson_context)?;
                load_granular_scope(connection, &resolved, &lesson_id)
            })
            .err()
            .expect("goals that changed must not be silently taught against");

        assert!(error.contains("changed"), "{error}");
    }
}
