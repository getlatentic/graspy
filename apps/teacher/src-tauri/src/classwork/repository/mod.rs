use crate::lesson_planning::sealed_plan::{
    SEALED_LEARNING_GOALS, SEALED_PLAN_JOIN, SEALED_SUBTOPIC, SEALED_TOPIC,
};
use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use crate::{
    content_corpus::TextbookFigure,
    lesson_planning::{
        granular::{GranularLessonPlan, LessonPlanStep},
        LessonContextRequest,
    },
};

use super::domain::*;

mod queries;
mod regeneration;
mod run_lifecycle;
mod section_state;
#[cfg(test)]
mod test_support;
mod versioning;

pub(crate) use queries::{figure_data_url, get_workspace};
pub(super) use regeneration::{
    begin_section_regeneration, cancel_section_regeneration, complete_section_regeneration,
    fail_section_regeneration,
};
pub(super) use run_lifecycle::{cancel_run, start_run};
pub(super) use section_state::{begin_section, complete_section, fail_section};
pub(super) use versioning::{approve_version, edit_block, restore_section, section_history};

#[cfg(test)]
use versioning::validate_teacher_edit;

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
    ).optional().map_err(db_error)?.ok_or_else(|| "Confirm the current lesson before creating its classwork.".to_owned())?;
    Ok(ConfirmedLessonContext {
        lesson_id: lesson_id.to_owned(),
        lesson_version_id: value.0,
        lesson_version_number: value.1,
        subject: value.2,
        grade: value.3,
        topic: value.4,
        subtopic: value.5,
        learning_goals: serde_json::from_str(&value.6).map_err(|error| error.to_string())?,
    })
}

fn lesson_for_run(
    connection: &Connection,
    context: &LessonContextRequest,
    run_id: &str,
) -> Result<ConfirmedLessonContext> {
    let lesson_id = connection
        .query_row(
            "SELECT lesson_id FROM classwork_runs WHERE id = ?1",
            [run_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "This classwork is no longer available.".to_owned())?;
    let lesson = confirmed_lesson(connection, context, &lesson_id)?;
    let run_version = connection
        .query_row(
            "SELECT lesson_version_id FROM classwork_runs WHERE id = ?1",
            [run_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(db_error)?;
    if run_version != lesson.lesson_version_id {
        return Err(
            "The lesson changed. Create the classwork from the newly confirmed version.".to_owned(),
        );
    }
    Ok(lesson)
}

fn synchronize_run_figures(
    transaction: &Transaction<'_>,
    run_id: &str,
    source_figures: &[TextbookFigure],
) -> Result<()> {
    let existing_count = transaction
        .query_row(
            "SELECT COUNT(*) FROM classwork_figures WHERE run_id = ?1",
            [run_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(db_error)?;
    if existing_count > 0 || source_figures.is_empty() {
        return Ok(());
    }
    for (index, figure) in source_figures.iter().enumerate() {
        let source_id = transaction
            .query_row(
                "SELECT id FROM classwork_sources
                 WHERE run_id = ?1 AND source_record_id = ?2",
                params![run_id, figure.record_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_error)?
            .ok_or_else(|| {
                "A lesson figure is not connected to its published source.".to_owned()
            })?;
        transaction
            .execute(
                "INSERT INTO classwork_figures (
                    id, run_id, source_id, sequence, asset_file_name, source_url,
                    caption, alt_text, sha256, media_type, width_px, height_px
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    new_id("classwork-figure"),
                    run_id,
                    source_id,
                    (index + 1) as i64,
                    figure.asset_file_name,
                    figure.source_url,
                    figure.caption,
                    figure.alt_text,
                    figure.sha256,
                    figure.media_type,
                    figure.width_px,
                    figure.height_px,
                ],
            )
            .map_err(db_error)?;
    }
    Ok(())
}

fn section_source_ids(
    connection: &Connection,
    section_id: &str,
) -> Result<HashMap<String, String>> {
    let mut statement = connection
        .prepare(
            "SELECT sources.source_key, sources.id FROM classwork_sources sources
             JOIN classwork_section_sources links ON links.source_id = sources.id
             WHERE links.section_id = ?1 ORDER BY sources.sequence",
        )
        .map_err(db_error)?;
    let values = statement
        .query_map([section_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(db_error)?
        .collect::<std::result::Result<HashMap<_, _>, _>>()
        .map_err(db_error)?;
    Ok(values)
}

fn require_active_token(
    connection: &Connection,
    run_id: &str,
    section_id: &str,
    token: &str,
) -> Result<()> {
    let valid = connection.query_row(
        "SELECT 1 FROM classwork_sections WHERE id = ?1 AND run_id = ?2 AND status = 'generating' AND generation_token = ?3",
        params![section_id, run_id, token], |_| Ok(()),
    ).optional().map_err(db_error)?.is_some();
    if valid {
        Ok(())
    } else {
        Err(
            "graspy stopped before this section was saved. Open the classwork to build it again."
                .to_owned(),
        )
    }
}

fn load_job(
    connection: &Connection,
    run_id: &str,
    section_id: &str,
    token: &str,
    lesson: ConfirmedLessonContext,
) -> Result<ClassworkSectionJob> {
    let sequence = connection
        .query_row(
            "SELECT sequence FROM classwork_sections WHERE id = ?1 AND run_id = ?2",
            params![section_id, run_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(db_error)?;
    let step = step_context(connection, &lesson.lesson_version_id, sequence)?;
    let mut statement = connection
        .prepare(
            "SELECT sources.source_key, sources.title, sources.text, sources.publisher,
                sources.source_url, sources.licence_name, sources.licence_url, sources.attribution
         FROM classwork_sources sources
         JOIN classwork_section_sources links ON links.source_id = sources.id
         WHERE links.section_id = ?1 ORDER BY sources.sequence",
        )
        .map_err(db_error)?;
    let source_materials = statement
        .query_map([section_id], |row| {
            Ok(ClassworkSource {
                key: row.get(0)?,
                title: row.get(1)?,
                text: row.get(2)?,
                publisher: row.get(3)?,
                source_url: row.get(4)?,
                licence_name: row.get(5)?,
                licence_url: row.get(6)?,
                attribution: row.get(7)?,
            })
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(ClassworkSectionJob {
        run_id: run_id.to_owned(),
        section_id: section_id.to_owned(),
        generation_token: token.to_owned(),
        lesson,
        step,
        source_materials,
        regeneration: None,
    })
}

/// The step a section is written for, as the plan sets it out.
///
/// The activities arrive as lists and the prompt wants prose, so they are joined
/// here — which is what the projected table used to store, and the only reason
/// it existed.
fn step_context(
    connection: &Connection,
    lesson_version_id: &str,
    sequence: i64,
) -> Result<ClassworkStepContext> {
    let plan_step =
        load_granular_plan_step(connection, lesson_version_id, sequence)?.ok_or_else(|| {
            "The confirmed lesson has no step for this part of its classwork.".to_owned()
        })?;
    Ok(ClassworkStepContext {
        sequence,
        title: plan_step.title.clone(),
        teacher_activity: plan_step.teacher_activities.join("\n"),
        learner_activity: plan_step.learner_activities.join("\n"),
        duration_minutes: Some(i64::from(plan_step.duration_minutes)),
        plan_step: Some(plan_step),
    })
}

fn load_granular_plan_step(
    connection: &Connection,
    lesson_version_id: &str,
    sequence: i64,
) -> Result<Option<LessonPlanStep>> {
    let Some(plan_json) = connection
        .query_row(
            "SELECT plan_json FROM lesson_granular_versions WHERE lesson_version_id = ?1",
            [lesson_version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?
    else {
        return Ok(None);
    };
    let plan: GranularLessonPlan = serde_json::from_str(&plan_json).map_err(|_| {
        "The detailed lesson plan could not be read. Reopen and confirm the lesson again."
            .to_owned()
    })?;
    let plan_step = plan
        .steps
        .into_iter()
        .find(|step| i64::from(step.sequence) == sequence)
        .ok_or_else(|| {
            "The detailed lesson step no longer matches the confirmed lesson. Reopen and confirm the lesson again."
                .to_owned()
        })?;
    Ok(Some(plan_step))
}

fn validate_generated_section(
    section: &GeneratedClassworkSectionInput,
    goal_count: usize,
    allowed_sources: &HashSet<String>,
) -> Result<()> {
    if section.title.trim().is_empty() || section.title.chars().count() > 160 {
        return Err("The section needs a title between 1 and 160 characters.".to_owned());
    }
    let goals: HashSet<_> = section.learning_goal_numbers.iter().copied().collect();
    if goals.is_empty()
        || goals.len() != section.learning_goal_numbers.len()
        || goals
            .iter()
            .any(|number| *number < 1 || *number as usize > goal_count)
    {
        return Err("The section must use valid learning goals from this lesson.".to_owned());
    }
    let required: HashSet<&str> = ["review", "worked_example", "practice", "solution"]
        .into_iter()
        .collect();
    let actual: HashSet<&str> = section
        .blocks
        .iter()
        .map(|block| block.kind.as_str())
        .collect();
    if section.blocks.len() != 4
        || actual != required
        || section.blocks.iter().any(|block| {
            block.text.trim().is_empty()
                || block.text.chars().count() > 8_000
                || block.text.contains("![")
                || block.text.to_ascii_lowercase().contains("<img")
        })
    {
        return Err(
            "The section must include a review, worked example, practice and solution.".to_owned(),
        );
    }
    let mut block_goals = HashSet::new();
    for block in &section.blocks {
        let block_goal_set: HashSet<_> = block.learning_goal_numbers.iter().copied().collect();
        if block_goal_set.is_empty()
            || block_goal_set.len() != block.learning_goal_numbers.len()
            || !block_goal_set.is_subset(&goals)
        {
            return Err("Every material block must use valid section learning goals.".to_owned());
        }
        block_goals.extend(block_goal_set);
        let block_source_set: HashSet<_> = block.source_material_keys.iter().cloned().collect();
        if block_source_set.len() != block.source_material_keys.len()
            || !block_source_set.is_subset(allowed_sources)
            || (!allowed_sources.is_empty() && block_source_set.is_empty())
        {
            return Err(
                "Every material block must use only the available source material.".to_owned(),
            );
        }
    }
    if block_goals != goals {
        return Err("The material blocks must cover every section learning goal.".to_owned());
    }
    validate_quality_report(&section.quality, false)?;
    Ok(())
}

fn validate_quality_report(report: &ClassworkQualityReport, allow_failed: bool) -> Result<()> {
    let expected_checks: HashSet<&str> = [
        "content_structure",
        "learning_goal_alignment",
        "scope_compliance",
        "source_presence",
        "source_validity",
        "unsupported_source_claims",
    ]
    .into_iter()
    .collect();
    if report.passes.is_empty() || report.passes.len() > 3 || report.scrubbed_claim_count < 0 {
        return Err("The section quality result is incomplete.".to_owned());
    }
    for pass in &report.passes {
        let checks: HashSet<_> = pass
            .checks
            .iter()
            .map(|check| check.check.as_str())
            .collect();
        if checks != expected_checks
            || pass.checks.len() != expected_checks.len()
            || pass.passed != pass.checks.iter().all(|check| check.passed)
            || pass.checks.iter().any(|check| {
                check.passed != check.details.is_empty()
                    || check.details.len() > 20
                    || check
                        .details
                        .iter()
                        .any(|detail| detail.trim().is_empty() || detail.chars().count() > 500)
            })
        {
            return Err("The section quality checks are inconsistent.".to_owned());
        }
    }
    if report.passes[0].stage != "initial"
        || report
            .passes
            .iter()
            .any(|pass| !matches!(pass.stage.as_str(), "initial" | "repair" | "scrub"))
        || report
            .passes
            .windows(2)
            .any(|pair| quality_stage_rank(&pair[0].stage) >= quality_stage_rank(&pair[1].stage))
    {
        return Err("The section quality check order is invalid.".to_owned());
    }
    let first_passed = report.passes[0].passed;
    let final_pass = report.passes.last().expect("non-empty quality passes");
    let valid_outcome = match report.outcome.as_str() {
        "passed" => {
            first_passed
                && final_pass.stage == "initial"
                && !report.repair_attempted
                && report.scrubbed_claim_count == 0
        }
        "repaired" => {
            !first_passed
                && final_pass.passed
                && final_pass.stage == "repair"
                && report.repair_attempted
                && report.scrubbed_claim_count == 0
        }
        "scrubbed" => {
            !first_passed
                && final_pass.passed
                && final_pass.stage == "scrub"
                && report.repair_attempted
                && report.scrubbed_claim_count > 0
        }
        "failed" => allow_failed && !final_pass.passed && report.repair_attempted,
        _ => false,
    };
    if !valid_outcome || (!allow_failed && report.outcome == "failed") {
        return Err("The section quality outcome does not match its checks.".to_owned());
    }
    Ok(())
}

fn quality_stage_rank(stage: &str) -> i64 {
    match stage {
        "initial" => 1,
        "repair" => 2,
        "scrub" => 3,
        _ => i64::MAX,
    }
}

fn clean_error(message: &str) -> String {
    let value = message.trim();
    if value.is_empty() || value.chars().count() > 500 {
        "This section could not be created. Try it again.".to_owned()
    } else {
        value.to_owned()
    }
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}
fn db_error(error: rusqlite::Error) -> String {
    let _source = error;
    "The classwork could not be saved. Close the app, reopen it, and try again.".to_owned()
}

#[cfg(test)]
pub(in crate::classwork) mod test_fixtures {
    use crate::{
        content_corpus::ContentCorpus, db::Database, lesson_planning::LessonContextRequest,
    };

    /// A confirmed lesson, which since the unreached confirm path was removed
    /// can only ever be a granular one with a plan sealed behind it.
    pub(in crate::classwork) fn setup() -> (Database, ContentCorpus, LessonContextRequest) {
        let database = Database::in_memory();
        database.with_connection(|connection| {
            connection.execute_batch(
            "INSERT INTO academic_sessions (id, start_year, end_year) VALUES ('session', 2026, 2027);
             INSERT INTO academic_periods
                (id, academic_session_id, ordinal, name, normalized_name, kind, legacy_term_number)
             VALUES ('period', 'session', 1, 'First term', 'first term', 'term', 1);
             INSERT INTO teaching_assignments (id, academic_session_id, subject_id, grade_level_id, class_section, class_section_key)
             VALUES ('assignment', 'session', 'subject-mathematics', 'grade-jss-2', 'A', 'a');
             INSERT INTO lessons (id, academic_session_id, academic_period_id, teaching_assignment_id, input_mode, topic, raw_plan,
                 learning_goals, instructional_materials, assessment, reference_notes, status, latest_version_number, source_plan_text)
             VALUES ('lesson', 'session', 'period', 'assignment', 'structured', 'Equivalent fractions', NULL,
                 '[\"Compare equivalent fractions.\",\"Explain equivalence.\"]', '[\"Fraction strips\"]', '[\"Exit task\"]',
                 '[\"Finding equivalent fractions (ch04-b016)\",\"Siyavula equivalent fractions (ch04-b014)\"]', 'confirmed', 1,
                 'Teacher displays one half beside two quarters.');",
            )?;
            connection.execute(
                "INSERT INTO lesson_versions (id, lesson_id, version_number, academic_session_id,
                     academic_period_id, teaching_assignment_id)
                 VALUES ('version', 'lesson', 1, 'session', 'period', 'assignment')",
                [],
            )?;
            crate::lesson_planning::sealed_plan::test_support::insert_sealed_plan(
                connection,
                "version",
                "Equivalent fractions",
                None,
                &["Compare equivalent fractions.", "Explain equivalence."],
                &[
                    ("Compare models", "Display the models."),
                    ("Explain equivalence", "Guide an explanation."),
                ],
                &["ch04-b016", "ch04-b014"],
            )?;
            Ok::<(), rusqlite::Error>(())
        }).expect("fixtures");
        let corpus = ContentCorpus::default();
        corpus
            .init_at(
                &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("resources/content/siyavula-jss1-mathematics-v1/corpus.sqlite3"),
            )
            .expect("content corpus");
        (
            database,
            corpus,
            LessonContextRequest {
                academic_session_id: "session".to_owned(),
                academic_period_id: "period".to_owned(),
                teaching_assignment_id: "assignment".to_owned(),
            },
        )
    }
}

#[cfg(test)]
mod tests {

    use crate::classwork::repository::test_support::*;
    use crate::classwork::repository::*;

    #[test]
    fn rejects_model_authored_images_at_the_native_boundary() {
        let mut section = generated("Unsafe image");
        section.blocks[0].text = "![Invented](https://example.com/invented.png)".to_owned();
        let sources = HashSet::from(["ch04-b016".to_owned()]);

        let error =
            validate_generated_section(&section, 2, &sources).expect_err("model-authored image");

        assert!(error.contains("review, worked example, practice and solution"));
    }
}
