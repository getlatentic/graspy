use crate::lesson_planning::sealed_plan::{
    SEALED_LEARNING_GOALS, SEALED_PLAN_JOIN, SEALED_SUBTOPIC, SEALED_TOPIC,
};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::classwork::domain::ConfirmedLessonContext;
use crate::lesson_planning::LessonContextRequest;

mod queries;
mod run_lifecycle;
mod section_state;

pub(crate) use queries::get_workspace;
pub(super) use run_lifecycle::{cancel_run, start_run};
pub(super) use section_state::{begin_section, complete_section, fail_section};

#[cfg(test)]
use section_state::{QUALITY_CHECKS, QUALITY_KINDS};

type Result<T> = std::result::Result<T, String>;

fn confirmed_lesson(
    connection: &Connection,
    context: &LessonContextRequest,
    lesson_id: &str,
) -> Result<ConfirmedLessonContext> {
    let value = connection.query_row(
        &format!(
        "SELECT lv.id, lv.version_number, subjects.name, grade_levels.display_name,
                {SEALED_TOPIC}, {SEALED_SUBTOPIC}, {SEALED_LEARNING_GOALS}
         FROM lessons
         JOIN lesson_versions lv ON lv.lesson_id = lessons.id AND lv.version_number = lessons.latest_version_number
         {SEALED_PLAN_JOIN}
         JOIN teaching_assignments ON teaching_assignments.id = lessons.teaching_assignment_id
         JOIN subjects ON subjects.id = teaching_assignments.subject_id
         JOIN grade_levels ON grade_levels.id = teaching_assignments.grade_level_id
         WHERE lessons.id = ?1 AND lessons.academic_session_id = ?2
           AND lessons.academic_period_id = ?3 AND lessons.teaching_assignment_id = ?4
           AND lessons.status = 'confirmed'"),
        params![lesson_id, context.academic_session_id, context.academic_period_id, context.teaching_assignment_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, Option<String>>(5)?, row.get::<_, String>(6)?)),
    ).optional().map_err(db_error)?.ok_or_else(|| "Confirm the current lesson before creating group classwork.".to_owned())?;
    Ok(ConfirmedLessonContext {
        lesson_id: lesson_id.to_owned(),
        lesson_version_id: value.0,
        lesson_version_number: value.1,
        subject: value.2,
        grade: value.3,
        topic: value.4,
        subtopic: value.5,
        learning_goals: parse_json(&value.6, "confirmed learning goals")?,
    })
}

fn lesson_for_run(
    connection: &Connection,
    context: &LessonContextRequest,
    run_id: &str,
) -> Result<ConfirmedLessonContext> {
    let lesson_id = connection
        .query_row(
            "SELECT lesson_id FROM differentiated_classwork_runs WHERE id = ?1",
            [run_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "This group's classwork is no longer available.".to_owned())?;
    let lesson = confirmed_lesson(connection, context, &lesson_id)?;
    let run_version = connection
        .query_row(
            "SELECT lesson_version_id FROM differentiated_classwork_runs WHERE id = ?1",
            [run_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(db_error)?;
    if run_version != lesson.lesson_version_id {
        return Err(
            "The lesson changed. Create the group classwork from the newly confirmed version."
                .to_owned(),
        );
    }
    Ok(lesson)
}

fn require_approved_base_run(connection: &Connection, lesson_version_id: &str) -> Result<String> {
    let run = connection
        .query_row(
            "SELECT runs.id FROM classwork_runs runs
             JOIN classwork_document_versions versions
               ON versions.run_id = runs.id
              AND versions.version_number = runs.current_document_version_number
              AND versions.status = 'approved'
             WHERE runs.lesson_version_id = ?1 AND runs.status = 'complete'",
            [lesson_version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| {
            "Review and approve the original classwork before creating group classwork.".to_owned()
        })?;
    let incomplete: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM classwork_sections WHERE run_id = ?1 AND status != 'done'",
            [&run],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if incomplete > 0 {
        return Err("Finish every section of the original classwork first.".to_owned());
    }
    Ok(run)
}

fn require_complete_evidence(
    connection: &Connection,
    lesson_version_id: &str,
) -> Result<(String, i64)> {
    connection
        .query_row(
            "SELECT id, revision FROM lesson_evidence_sets
             WHERE lesson_version_id = ?1 AND status = 'complete'",
            [lesson_version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "Finish the class results before creating group classwork.".to_owned())
}

fn require_active_token(
    connection: &Connection,
    run_id: &str,
    group_id: &str,
    section_id: &str,
    token: &str,
) -> Result<()> {
    let matched: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM differentiated_classwork_sections
             WHERE id = ?1 AND run_id = ?2 AND group_id = ?3
               AND status = 'generating' AND generation_token = ?4",
            params![section_id, run_id, group_id, token],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if matched != 1 {
        return Err("graspy stopped before this group classwork was saved. Open the lesson to build it again."
            .to_owned());
    }
    Ok(())
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}

fn json<T: serde::Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

fn parse_json<T: serde::de::DeserializeOwned>(value: &str, label: &str) -> Result<T> {
    serde_json::from_str(value).map_err(|_| format!("The {label} could not be read."))
}

fn db_error(_error: rusqlite::Error) -> String {
    "The group classwork could not be saved. Close the app, reopen it, and try again.".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classwork::domain::{
        ClassworkQualityReport, ClassworkValidationCheck, ClassworkValidationPass,
        GeneratedClassworkBlockInput, GeneratedClassworkSectionInput,
    };
    use crate::db::Database;
    use crate::differentiated_classwork::domain::*;

    fn setup() -> (Database, LessonContextRequest) {
        let database = Database::in_memory();
        database.with_connection(|connection| connection.execute_batch(
            "INSERT INTO academic_sessions (id, start_year, end_year) VALUES ('session', 2026, 2027);
             INSERT INTO academic_periods
                (id, academic_session_id, ordinal, name, normalized_name, kind, legacy_term_number)
             VALUES ('period', 'session', 1, 'First term', 'first term', 'term', 1);
             INSERT INTO teaching_assignments
                (id, academic_session_id, subject_id, grade_level_id, class_section, class_section_key)
             VALUES ('assignment', 'session', 'subject-mathematics', 'grade-jss-2', 'A', 'a');
             INSERT INTO lessons
                (id, academic_session_id, academic_period_id, teaching_assignment_id, input_mode,
                 topic, raw_plan, learning_goals, instructional_materials, assessment, reference_notes,
                 status, latest_version_number, source_plan_text)
             VALUES ('lesson', 'session', 'period', 'assignment', 'structured',
                 'Linear equations', NULL, '[\"Solve equations.\"]', '[]', '[]', '[]',
                 'confirmed', 1, NULL);
             INSERT INTO lesson_versions
                (id, lesson_id, version_number, academic_session_id, academic_period_id,
                 teaching_assignment_id)
             VALUES ('version', 'lesson', 1, 'session', 'period', 'assignment');
             INSERT INTO classwork_runs
                (id, lesson_id, lesson_version_id, lesson_version_number, status,
                 current_document_version_number)
             VALUES ('base-run', 'lesson', 'version', 1, 'complete', 1);
             INSERT INTO classwork_sections
                (id, run_id, plan_step_id, sequence, step_title, status,
                 generated_title, learning_goal_numbers, attempt_count, quality_outcome,
                 repair_attempted, scrubbed_claim_count)
             VALUES ('base-section', 'base-run', 'lesson-step-1', 1, 'Introduction', 'done',
                 'Keeping equations balanced', '[1]', 1, 'passed', 0, 0);
             INSERT INTO classwork_sources
                (id, run_id, source_key, kind, title, text, source_record_id, publisher,
                 source_url, licence_name, licence_url, attribution, sequence)
             VALUES
                ('source-row-1', 'base-run', 'source-1', 'published_source', 'Algebra',
                 'A balanced equation uses the same operation on both sides.', 'record-1',
                 'Siyavula', 'https://example.test/source-1', 'CC BY',
                 'https://creativecommons.org/licenses/by/4.0/', 'Siyavula, CC BY', 1),
                ('source-row-2', 'base-run', 'source-2', 'published_source', 'Unused source',
                 'This excerpt is not cited by the base section.', 'record-2', 'Siyavula',
                 'https://example.test/source-2', 'CC BY',
                 'https://creativecommons.org/licenses/by/4.0/', 'Siyavula, CC BY', 2);
             INSERT INTO classwork_section_sources (section_id, source_id)
             VALUES ('base-section', 'source-row-1'), ('base-section', 'source-row-2');
             INSERT INTO classwork_blocks (id, section_id, sequence, kind, text) VALUES
                ('base-review', 'base-section', 1, 'review', 'Original review'),
                ('base-example', 'base-section', 2, 'worked_example', 'Original example'),
                ('base-practice', 'base-section', 3, 'practice', 'Original practice'),
                ('base-solution', 'base-section', 4, 'solution', 'Original solution');
             INSERT INTO classwork_block_learning_goals (block_id, learning_goal_number)
             VALUES ('base-review', 1), ('base-example', 1), ('base-practice', 1), ('base-solution', 1);
             INSERT INTO classwork_block_sources (block_id, source_id)
             VALUES ('base-review', 'source-row-1'), ('base-example', 'source-row-1'),
                    ('base-practice', 'source-row-1'), ('base-solution', 'source-row-1');
             INSERT INTO classwork_document_versions
                (id, run_id, version_number, status, change_kind, approved_at)
             VALUES ('approved-version', 'base-run', 1, 'approved', 'initial', CURRENT_TIMESTAMP);
             INSERT INTO classwork_document_sections
                (id, document_version_id, run_id, base_section_id, title,
                 learning_goal_numbers, regenerated)
             VALUES ('version-section', 'approved-version', 'base-run', 'base-section',
                     'Keeping equations balanced', '[1]', 0);
             INSERT INTO classwork_document_blocks
                (id, document_version_id, run_id, base_block_id, section_id, sequence,
                 kind, text, teacher_edited, learning_goal_numbers, source_material_keys)
             VALUES
                ('version-review', 'approved-version', 'base-run', 'base-review',
                 'base-section', 1, 'review', 'Teacher-reviewed explanation', 1, '[1]', '[\"source-1\"]'),
                ('version-example', 'approved-version', 'base-run', 'base-example',
                 'base-section', 2, 'worked_example', 'Original example', 0, '[1]', '[\"source-1\"]'),
                ('version-practice', 'approved-version', 'base-run', 'base-practice',
                 'base-section', 3, 'practice', 'Original practice', 0, '[1]', '[\"source-1\"]'),
                ('version-solution', 'approved-version', 'base-run', 'base-solution',
                 'base-section', 4, 'solution', 'Original solution', 0, '[1]', '[\"source-1\"]');
             INSERT INTO lesson_evidence_sets
                (id, lesson_id, lesson_version_id, status, revision, completed_at)
             VALUES ('evidence', 'lesson', 'version', 'complete', 2, CURRENT_TIMESTAMP);
             INSERT INTO lesson_evidence_groups
                (id, evidence_set_id, position, name, name_key, interest_score, lesson_feeling_score)
             VALUES
                ('evidence-group-1', 'evidence', 1, 'Bridge group', 'bridge group', 2, 2),
                ('evidence-group-2', 'evidence', 2, 'Practice group', 'practice group', 3, 3),
                ('evidence-group-3', 'evidence', 3, 'Challenge group', 'challenge group', 5, 5);
             INSERT INTO lesson_evidence_entries
                (id, evidence_set_id, group_id, learning_goal_number, questions_correct,
                 questions_total, misunderstanding_note, confidence_score, difficulty_score)
             VALUES
                ('entry-1', 'evidence', 'evidence-group-1', 1, 1, 4, 'Adds instead of subtracting', 2, 4),
                ('entry-2', 'evidence', 'evidence-group-2', 1, 2, 4, NULL, 3, 3),
                ('entry-3', 'evidence', 'evidence-group-3', 1, 4, 4, NULL, 5, 1);"
        )).expect("fixtures");
        database
            .with_connection(|connection| {
                crate::lesson_planning::sealed_plan::test_support::insert_sealed_plan(
                    connection,
                    "version",
                    "Linear equations",
                    None,
                    &["Solve equations."],
                    &[("Introduction", "Model one equation.")],
                    &[],
                )
            })
            .expect("the sealed plan");
        (
            database,
            LessonContextRequest {
                academic_session_id: "session".into(),
                academic_period_id: "period".into(),
                teaching_assignment_id: "assignment".into(),
            },
        )
    }

    fn quality(outcome: &str, passed: bool) -> ClassworkQualityReport {
        ClassworkQualityReport {
            outcome: outcome.into(),
            repair_attempted: false,
            scrubbed_claim_count: 0,
            passes: vec![ClassworkValidationPass {
                stage: "initial".into(),
                passed,
                checks: QUALITY_CHECKS
                    .iter()
                    .map(|name| ClassworkValidationCheck {
                        check: (*name).into(),
                        passed,
                        details: if passed {
                            vec![]
                        } else {
                            vec!["Needs repair".into()]
                        },
                    })
                    .collect(),
            }],
        }
    }

    fn generated() -> GeneratedClassworkSectionInput {
        GeneratedClassworkSectionInput {
            title: "Keeping equations balanced — guided".into(),
            learning_goal_numbers: vec![1],
            blocks: QUALITY_KINDS
                .iter()
                .map(|kind| GeneratedClassworkBlockInput {
                    kind: (*kind).into(),
                    text: format!("Guided {kind}"),
                    learning_goal_numbers: vec![1],
                    source_material_keys: vec!["source-1".into()],
                })
                .collect(),
            quality: quality("passed", true),
        }
    }

    #[test]
    fn snapshots_three_groups_and_only_the_base_sections_sources() {
        let (database, context) = setup();
        let workspace = start_run(
            &database,
            StartDifferentiatedRunRequest {
                context: context.clone(),
                lesson_id: "lesson".into(),
            },
        )
        .expect("start");
        let run = workspace.run.expect("run");
        assert_eq!(run.groups.len(), 3);
        assert_eq!(run.groups[0].learner_state[0].mastery_band, "remediate");
        assert_eq!(run.groups[2].learner_state[0].mastery_band, "extend");
        assert_eq!(
            run.groups[0].session_signals.lesson_feeling.as_deref(),
            Some("still unsure (2/5)")
        );

        let started = begin_section(
            &database,
            BeginDifferentiatedSectionRequest {
                context,
                run_id: run.id,
                section_id: None,
            },
        )
        .expect("begin");
        assert_eq!(started.job.group.name, "Bridge group");
        assert_eq!(started.job.source_materials.len(), 1);
        assert_eq!(started.job.source_materials[0].key, "source-1");
        assert_eq!(started.job.base_section.blocks.len(), 4);
        assert_eq!(
            started.job.base_section.blocks[0].text,
            "Teacher-reviewed explanation"
        );
        assert!(started.job.base_section.blocks[0].teacher_edited);
    }

    #[test]
    fn saves_a_validated_section_and_rejects_a_stale_token() {
        let (database, context) = setup();
        let workspace = start_run(
            &database,
            StartDifferentiatedRunRequest {
                context: context.clone(),
                lesson_id: "lesson".into(),
            },
        )
        .expect("start");
        let run_id = workspace.run.unwrap().id;
        let started = begin_section(
            &database,
            BeginDifferentiatedSectionRequest {
                context: context.clone(),
                run_id: run_id.clone(),
                section_id: None,
            },
        )
        .expect("begin");
        let request = CompleteDifferentiatedSectionRequest {
            context: context.clone(),
            run_id: run_id.clone(),
            group_id: started.job.group_id.clone(),
            section_id: started.job.section_id.clone(),
            generation_token: started.job.generation_token.clone(),
            section: generated(),
        };
        let saved = complete_section(&database, request).expect("complete");
        assert_eq!(
            saved.run.as_ref().unwrap().groups[0].sections[0].status,
            "done"
        );
        assert_eq!(
            saved.run.as_ref().unwrap().groups[0].sections[0]
                .blocks
                .len(),
            4
        );

        let stale = CompleteDifferentiatedSectionRequest {
            context,
            run_id,
            group_id: started.job.group_id,
            section_id: started.job.section_id,
            generation_token: started.job.generation_token,
            section: generated(),
        };
        assert_eq!(
            complete_section(&database, stale).unwrap_err(),
            "graspy stopped before this group classwork was saved. Open the lesson to build it again."
        );
    }

    #[test]
    fn reopens_interrupted_work_as_an_explicit_retryable_failure() {
        let (database, context) = setup();
        let workspace = start_run(
            &database,
            StartDifferentiatedRunRequest {
                context: context.clone(),
                lesson_id: "lesson".into(),
            },
        )
        .expect("start");
        let run_id = workspace.run.unwrap().id;
        begin_section(
            &database,
            BeginDifferentiatedSectionRequest {
                context: context.clone(),
                run_id,
                section_id: None,
            },
        )
        .expect("begin");
        let reopened = get_workspace(
            &database,
            DifferentiatedWorkspaceRequest {
                context,
                lesson_id: "lesson".into(),
            },
        )
        .expect("reopen");
        let section = &reopened.run.unwrap().groups[0].sections[0];
        assert_eq!(section.status, "failed");
        assert!(section
            .last_error
            .as_deref()
            .unwrap()
            .contains("interrupted"));
    }
}
