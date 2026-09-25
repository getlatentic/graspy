use crate::lesson_planning::sealed_plan::{SEALED_PLAN_JOIN, SEALED_SOURCE_RECORD_IDS};
use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::classwork::domain::*;
use crate::content_corpus::{ContentCorpus, TextbookExcerpt, TextbookFigure};
use crate::db::Database;
use crate::lesson_planning::LessonContextRequest;

use super::queries::load_workspace;
use super::{
    confirmed_lesson, db_error, lesson_for_run, new_id, require_active_token,
    synchronize_run_figures, Result,
};

pub(in crate::classwork) fn start_run(
    database: &Database,
    corpus: &ContentCorpus,
    request: StartClassworkRunRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    let source_request = database.with_connection(|connection| {
        lesson_source_request(connection, &request.context, &request.lesson_id)
    })?;
    let source_materials = corpus.resolve_record_ids(&source_request.source_record_ids)?;
    let source_record_ids = source_materials
        .iter()
        .map(|source| source.record_id.clone())
        .collect::<Vec<_>>();
    let source_figures = corpus.resolve_figures(&source_record_ids)?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = confirmed_lesson(&transaction, &request.context, &request.lesson_id)?;
        if lesson.lesson_version_id != source_request.lesson_version_id {
            return Err(
                "The lesson changed before its source material could be prepared. Try again."
                    .to_owned(),
            );
        }
        let existing = transaction
            .query_row(
                "SELECT id FROM classwork_runs WHERE lesson_version_id = ?1",
                [&lesson.lesson_version_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_error)?;
        if existing.is_none() {
            create_run(&transaction, &lesson, &source_materials, &source_figures)?;
        } else if let Some(run_id) = existing.as_deref() {
            synchronize_run_figures(&transaction, run_id, &source_figures)?;
        }
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::classwork) fn cancel_run(
    database: &Database,
    request: CancelClassworkRunRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        require_active_token(&transaction, &request.run_id, &request.section_id, &request.generation_token)?;
        transaction.execute(
            "UPDATE classwork_sections SET status = 'pending', generation_token = NULL,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [&request.section_id],
        ).map_err(db_error)?;
        transaction.execute(
            "UPDATE classwork_runs SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [&request.run_id],
        ).map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

fn create_run(
    transaction: &Transaction<'_>,
    lesson: &ConfirmedLessonContext,
    source_materials: &[TextbookExcerpt],
    source_figures: &[TextbookFigure],
) -> Result<()> {
    let run_id = new_id("classwork-run");
    transaction.execute(
        "INSERT INTO classwork_runs (id, lesson_id, lesson_version_id, lesson_version_number, status)
         VALUES (?1, ?2, ?3, ?4, 'paused')",
        params![run_id, lesson.lesson_id, lesson.lesson_version_id, lesson.lesson_version_number],
    ).map_err(db_error)?;
    let sections_created = transaction
        .execute(
            "INSERT INTO classwork_sections (id, run_id, plan_step_id, sequence, step_title)
         SELECT 'classwork-section-' || lower(hex(randomblob(16))), ?1,
                json_extract(step.value, '$.id'),
                json_extract(step.value, '$.sequence'),
                json_extract(step.value, '$.title')
         FROM lesson_granular_versions sealed, json_each(sealed.plan_json, '$.steps') step
         WHERE sealed.lesson_version_id = ?2
         ORDER BY json_extract(step.value, '$.sequence')",
            params![run_id, lesson.lesson_version_id],
        )
        .map_err(db_error)?;
    if sections_created == 0 {
        return Err("The confirmed lesson has no lesson steps.".to_owned());
    }
    for (index, source) in source_materials.iter().enumerate() {
        let source_id = new_id("classwork-source");
        transaction
            .execute(
                "INSERT INTO classwork_sources (
                    id, run_id, source_key, kind, title, text, source_record_id,
                    publisher, source_url, licence_name, licence_url, attribution, sequence
                 ) VALUES (?1, ?2, ?3, 'published_source', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    source_id,
                    run_id,
                    source.record_id,
                    source.title,
                    source.text,
                    source.record_id,
                    source.attribution.publisher,
                    source.attribution.source_url,
                    source.attribution.licence_name,
                    source.attribution.licence_url,
                    source.attribution.attribution,
                    (index + 1) as i64,
                ],
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "INSERT INTO classwork_section_sources (section_id, source_id)
             SELECT id, ?1 FROM classwork_sections WHERE run_id = ?2",
                params![source_id, run_id],
            )
            .map_err(db_error)?;
    }
    synchronize_run_figures(transaction, &run_id, source_figures)?;
    Ok(())
}

struct LessonSourceRequest {
    lesson_version_id: String,
    source_record_ids: Vec<String>,
}

fn lesson_source_request(
    connection: &Connection,
    context: &LessonContextRequest,
    lesson_id: &str,
) -> Result<LessonSourceRequest> {
    let value = connection
        .query_row(
            &format!(
                "SELECT lv.id, {SEALED_SOURCE_RECORD_IDS}
             FROM lessons
             JOIN lesson_versions lv ON lv.lesson_id = lessons.id
                AND lv.version_number = lessons.latest_version_number
             {SEALED_PLAN_JOIN}
             WHERE lessons.id = ?1 AND lessons.academic_session_id = ?2
               AND lessons.academic_period_id = ?3
               AND lessons.teaching_assignment_id = ?4
               AND lessons.status = 'confirmed'"
            ),
            params![
                lesson_id,
                context.academic_session_id,
                context.academic_period_id,
                context.teaching_assignment_id
            ],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "Confirm the current lesson before writing its classwork.".to_owned())?;
    Ok(LessonSourceRequest {
        lesson_version_id: value.0,
        source_record_ids: serde_json::from_str(&value.1).map_err(|_| {
            "The lesson references could not be read. Review and confirm the lesson again."
                .to_owned()
        })?,
    })
}

#[cfg(test)]
mod tests {

    use crate::classwork::repository::test_fixtures::setup;
    use crate::classwork::repository::test_support::*;
    use crate::classwork::repository::*;

    #[test]
    fn classwork_jobs_include_the_exact_confirmed_granular_plan_step() {
        let (database, corpus, context) = setup();
        let plan = serde_json::json!({
            "schemaVersion": 1,
            "topic": "Equivalent fractions",
            "subtopic": null,
            "curriculumObjectives": [],
            "atomicObjectives": [],
            "lessonObjectives": [],
            "knowledgeComponents": [],
            "misconceptions": [],
            "priorKnowledge": [],
            "materials": [],
            "references": [],
            "steps": [{
                "id": "plan-step-1",
                "sequence": 1,
                "role": "core",
                "title": "Compare models",
                "summary": "Compare equivalent fractions.",
                "durationMinutes": 15,
                "lessonObjectiveId": "objective-1",
                "knowledgeType": "representation",
                "teacherActivities": ["Display the models."],
                "learnerActivities": ["Compare the lengths."],
                "blocks": [{
                    "type": "practice",
                    "id": "practice-1",
                    "lessonObjectiveId": "objective-1",
                    "question": "Which is greater: 1/2 or 2/4?",
                    "expectedAnswer": "They are equal.",
                    "hints": ["Use a fraction strip."]
                }]
            }],
            "assessments": []
        });
        let digest = "0".repeat(64);
        database
            .with_connection(|connection| {
                connection.execute_batch(
                    "UPDATE lessons SET latest_version_number = 2 WHERE id = 'lesson';
                     INSERT INTO lesson_versions (id, lesson_id, version_number,
                         academic_session_id, academic_period_id, teaching_assignment_id)
                     VALUES ('version-2', 'lesson', 2, 'session', 'period', 'assignment');",
                )?;
                connection.execute(
                    "INSERT INTO lesson_granular_versions (
                         lesson_version_id, plan_json, plan_sha256,
                         curriculum_snapshot_json, curriculum_snapshot_sha256,
                         source_evidence_snapshot_json, source_evidence_snapshot_sha256,
                         program_id, program_version, program_digest
                     ) VALUES ('version-2', ?1, ?2, '{}', ?2, '{}', ?2, 'lesson-plan.granular', '1.1.0', ?2)",
                    params![plan.to_string(), digest],
                )
            })
            .expect("granular version");
        let workspace = start_run(
            &database,
            &corpus,
            StartClassworkRunRequest {
                context: context.clone(),
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("run");
        let started = begin_section(
            &database,
            BeginClassworkSectionRequest {
                context,
                run_id: workspace.run.expect("run").id,
                section_id: None,
            },
        )
        .expect("section");

        let plan_step = started.job.step.plan_step.expect("exact plan step");
        assert_eq!(plan_step.id, "plan-step-1");
        assert_eq!(plan_step.blocks.len(), 1);
        assert!(matches!(
            &plan_step.blocks[0],
            crate::lesson_planning::granular::LessonContentBlock::Practice {
                question,
                expected_answer,
                ..
            } if question == "Which is greater: 1/2 or 2/4?" && expected_answer == "They are equal."
        ));
    }

    #[test]
    fn cancellation_preserves_completed_work_and_rejects_a_late_response() {
        let (database, corpus, context) = setup();
        let run = start_run(
            &database,
            &corpus,
            StartClassworkRunRequest {
                context: context.clone(),
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("run")
        .run
        .expect("run");
        let active = begin_section(
            &database,
            BeginClassworkSectionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: None,
            },
        )
        .expect("active")
        .job;
        let cancelled = cancel_run(
            &database,
            CancelClassworkRunRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: active.section_id.clone(),
                generation_token: active.generation_token.clone(),
            },
        )
        .expect("cancelled");
        assert_eq!(cancelled.run.as_ref().expect("run").status, "cancelled");
        assert_eq!(
            cancelled.run.as_ref().expect("run").sections[0].status,
            "pending"
        );
        let late = complete_section(
            &database,
            CompleteClassworkSectionRequest {
                context,
                run_id: run.id,
                section_id: active.section_id,
                generation_token: active.generation_token,
                section: generated("Late"),
            },
        )
        .expect_err("late response");
        assert!(late.contains("graspy stopped before this section was saved"));
    }

    #[test]
    fn rejects_an_unknown_explicit_source_before_creating_a_run() {
        let (database, corpus, context) = setup();
        database
            .with_connection(|connection| {
                connection.execute_batch(
                    "INSERT INTO lessons (
                        id, academic_session_id, academic_period_id, teaching_assignment_id,
                        input_mode, topic, raw_plan, learning_goals, instructional_materials, assessment,
                        reference_notes, status, latest_version_number
                     ) VALUES (
                        'lesson-missing-source', 'session', 'period', 'assignment', 'structured',
                        'Missing source lesson', NULL, '[\"Use the source.\"]', '[]', '[]',
                        '[\"Missing source (unknown-record)\"]', 'confirmed', 1
                     );
                     INSERT INTO lesson_versions (
                        id, lesson_id, version_number, academic_session_id, academic_period_id,
                        teaching_assignment_id
                     ) VALUES (
                        'version-missing-source', 'lesson-missing-source', 1, 'session', 'period',
                        'assignment'
                     );",
                )?;
                crate::lesson_planning::sealed_plan::test_support::insert_sealed_plan(
                    connection,
                    "version-missing-source",
                    "Missing source lesson",
                    None,
                    &["Use the source."],
                    &[("Introduction", "Use the source.")],
                    &["unknown-record"],
                )
            })
            .expect("unknown reference");

        let error = start_run(
            &database,
            &corpus,
            StartClassworkRunRequest {
                context,
                lesson_id: "lesson-missing-source".to_owned(),
            },
        )
        .expect_err("missing source");

        assert!(error.contains("unknown-record"), "unexpected: {error}");
        let run_count = database
            .with_connection(|connection| {
                connection.query_row("SELECT COUNT(*) FROM classwork_runs", [], |row| {
                    row.get::<_, i64>(0)
                })
            })
            .expect("run count");
        assert_eq!(run_count, 0);
    }
}
