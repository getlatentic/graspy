use std::collections::{BTreeMap, BTreeSet, HashSet};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use crate::classwork::domain::{
    ClassworkBlock, ClassworkQualityReport, ClassworkSource, ConfirmedLessonContext,
    GeneratedClassworkBlockInput, GeneratedClassworkSectionInput,
};
use crate::db::Database;
use crate::differentiated_classwork::domain::*;

use super::queries::load_workspace;
use super::{
    db_error, json, lesson_for_run, new_id, parse_json, require_active_token,
    require_complete_evidence, Result,
};

pub(in crate::differentiated_classwork) fn begin_section(
    database: &Database,
    request: BeginDifferentiatedSectionRequest,
) -> Result<DifferentiatedClassworkSectionStart> {
    database.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        require_current_evidence_revision(&transaction, &request.run_id)?;
        let active_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM differentiated_classwork_sections
                 WHERE run_id = ?1 AND status = 'generating'",
                [&request.run_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if active_count > 0 {
            return Err("A group section is already being created.".to_owned());
        }

        let section_id = if let Some(section_id) = request.section_id.as_deref() {
            transaction
                .query_row(
                    "SELECT id FROM differentiated_classwork_sections
                     WHERE id = ?1 AND run_id = ?2 AND status = 'failed'",
                    params![section_id, request.run_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| {
                    "Only a group section that needs attention can be tried again.".to_owned()
                })?
        } else {
            let failed_count: i64 = transaction
                .query_row(
                    "SELECT COUNT(*) FROM differentiated_classwork_sections
                     WHERE run_id = ?1 AND status = 'failed'",
                    [&request.run_id],
                    |row| row.get(0),
                )
                .map_err(db_error)?;
            if failed_count > 0 {
                return Err(
                    "Try the group section that needs attention before continuing.".to_owned(),
                );
            }
            transaction
                .query_row(
                    "SELECT sections.id
                     FROM differentiated_classwork_sections sections
                     JOIN differentiated_classwork_groups groups ON groups.id = sections.group_id
                     WHERE sections.run_id = ?1 AND sections.status = 'pending'
                     ORDER BY groups.position, sections.sequence LIMIT 1",
                    [&request.run_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| "Every group already has its classwork.".to_owned())?
        };

        let token = Uuid::new_v4().to_string();
        transaction
            .execute(
                "UPDATE differentiated_classwork_sections
                 SET status = 'generating', generation_token = ?1,
                     attempt_count = attempt_count + 1, last_error = NULL,
                     quality_report = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2",
                params![token, section_id],
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "UPDATE differentiated_classwork_runs
                 SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                [&request.run_id],
            )
            .map_err(db_error)?;
        let job = load_job(&transaction, &request.run_id, &section_id, &token, &lesson)?;
        transaction.commit().map_err(db_error)?;
        Ok(DifferentiatedClassworkSectionStart {
            job,
            workspace: load_workspace(connection, lesson)?,
        })
    })
}

pub(in crate::differentiated_classwork) fn complete_section(
    database: &Database,
    request: CompleteDifferentiatedSectionRequest,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot> {
    database.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        require_active_token(
            &transaction,
            &request.run_id,
            &request.group_id,
            &request.section_id,
            &request.generation_token,
        )?;
        let base_section = load_base_snapshot(&transaction, &request.section_id)?;
        let source_materials = load_source_snapshot(&transaction, &request.section_id)?;
        validate_generated_section(&request.section, &base_section, &source_materials)?;

        transaction
            .execute(
                "DELETE FROM differentiated_classwork_blocks WHERE section_id = ?1",
                [&request.section_id],
            )
            .map_err(db_error)?;
        let base_by_kind = base_section
            .blocks
            .iter()
            .map(|block| (block.kind.as_str(), block))
            .collect::<BTreeMap<_, _>>();
        for (index, block) in request.section.blocks.iter().enumerate() {
            let base = base_by_kind.get(block.kind.as_str()).ok_or_else(|| {
                "The adjusted section no longer matches its original blocks.".to_owned()
            })?;
            transaction
                .execute(
                    "INSERT INTO differentiated_classwork_blocks
                     (id, section_id, base_block_id, sequence, kind, text,
                      learning_goal_numbers, source_material_keys)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        new_id("group-classwork-block"),
                        request.section_id,
                        base.id,
                        (index + 1) as i64,
                        block.kind,
                        block.text.trim(),
                        json(&block.learning_goal_numbers)?,
                        json(&block.source_material_keys)?,
                    ],
                )
                .map_err(db_error)?;
        }
        transaction
            .execute(
                "UPDATE differentiated_classwork_sections
                 SET status = 'done', generation_token = NULL, last_error = NULL,
                     generated_title = ?1, learning_goal_numbers = ?2, quality_report = ?3,
                     updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
                params![
                    request.section.title.trim(),
                    json(&request.section.learning_goal_numbers)?,
                    json(&request.section.quality)?,
                    request.section_id,
                ],
            )
            .map_err(db_error)?;
        update_run_after_section(&transaction, &request.run_id)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::differentiated_classwork) fn fail_section(
    database: &Database,
    request: FailDifferentiatedSectionRequest,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot> {
    database.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        require_active_token(
            &transaction,
            &request.run_id,
            &request.group_id,
            &request.section_id,
            &request.generation_token,
        )?;
        if let Some(quality) = request.quality.as_ref() {
            validate_quality_report(quality, true)?;
        }
        transaction
            .execute(
                "UPDATE differentiated_classwork_sections
                 SET status = 'failed', generation_token = NULL, last_error = ?1,
                     quality_report = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
                params![
                    clean_error(&request.message),
                    request.quality.as_ref().map(json).transpose()?,
                    request.section_id,
                ],
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "UPDATE differentiated_classwork_runs
                 SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                [&request.run_id],
            )
            .map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

fn require_current_evidence_revision(connection: &Connection, run_id: &str) -> Result<()> {
    let (lesson_version_id, saved_revision): (String, i64) = connection
        .query_row(
            "SELECT lesson_version_id, evidence_revision FROM differentiated_classwork_runs WHERE id = ?1",
            [run_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(db_error)?;
    let (_, current_revision) = require_complete_evidence(connection, &lesson_version_id)?;
    if current_revision != saved_revision {
        return Err(
            "The class results changed. Create new group classwork from the latest results."
                .to_owned(),
        );
    }
    Ok(())
}

fn load_job(
    connection: &Connection,
    run_id: &str,
    section_id: &str,
    token: &str,
    lesson: &ConfirmedLessonContext,
) -> Result<DifferentiatedClassworkSectionJob> {
    let row = connection
        .query_row(
            "SELECT sections.group_id, groups.name, groups.learner_state_snapshot,
                    groups.session_signals_snapshot, sections.base_section_snapshot,
                    sections.source_materials_snapshot
             FROM differentiated_classwork_sections sections
             JOIN differentiated_classwork_groups groups ON groups.id = sections.group_id
             WHERE sections.id = ?1 AND sections.run_id = ?2",
            params![section_id, run_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(db_error)?;
    let base_section: DifferentiatedClassworkBaseSection =
        parse_json(&row.4, "original section snapshot")?;
    let all_states: Vec<PersonalisationLearningGoalState> =
        parse_json(&row.2, "saved group learning state")?;
    let goals = base_section
        .learning_goal_numbers
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let learning_goals = all_states
        .into_iter()
        .filter(|state| goals.contains(&state.learning_goal_number))
        .collect::<Vec<_>>();
    if learning_goals.len() != goals.len() {
        return Err(
            "The saved group results do not cover this section’s learning goals.".to_owned(),
        );
    }
    Ok(DifferentiatedClassworkSectionJob {
        run_id: run_id.to_owned(),
        group_id: row.0,
        section_id: section_id.to_owned(),
        generation_token: token.to_owned(),
        lesson: DifferentiatedLessonContext {
            topic: lesson.topic.clone(),
            learning_goals: lesson.learning_goals.clone(),
        },
        group: DifferentiatedGroupContext {
            name: row.1,
            learning_goals,
            session_signals: parse_json(&row.3, "saved overall lesson signals")?,
        },
        base_section,
        source_materials: parse_json(&row.5, "scoped section sources")?,
    })
}

fn load_base_snapshot(
    connection: &Connection,
    section_id: &str,
) -> Result<DifferentiatedClassworkBaseSection> {
    let value = connection
        .query_row(
            "SELECT base_section_snapshot FROM differentiated_classwork_sections WHERE id = ?1",
            [section_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(db_error)?;
    parse_json(&value, "original section snapshot")
}

fn load_source_snapshot(connection: &Connection, section_id: &str) -> Result<Vec<ClassworkSource>> {
    let value = connection
        .query_row(
            "SELECT source_materials_snapshot FROM differentiated_classwork_sections WHERE id = ?1",
            [section_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(db_error)?;
    parse_json(&value, "scoped section sources")
}

fn validate_generated_section(
    section: &GeneratedClassworkSectionInput,
    base: &DifferentiatedClassworkBaseSection,
    sources: &[ClassworkSource],
) -> Result<()> {
    validate_quality_report(&section.quality, false)?;
    if section.title.trim().is_empty() || section.title.chars().count() > 160 {
        return Err("The adjusted section title is invalid.".to_owned());
    }
    if canonical_numbers(&section.learning_goal_numbers)
        != canonical_numbers(&base.learning_goal_numbers)
    {
        return Err("The adjusted section must preserve the original learning goals.".to_owned());
    }
    if section.blocks.len() != 4 {
        return Err("The adjusted section must contain exactly four material blocks.".to_owned());
    }
    let base_by_kind = base
        .blocks
        .iter()
        .map(|block| (block.kind.as_str(), block))
        .collect::<BTreeMap<_, _>>();
    let allowed_sources = sources
        .iter()
        .map(|source| source.key.as_str())
        .collect::<HashSet<_>>();
    let mut kinds = HashSet::new();
    let mut changed = false;
    for block in &section.blocks {
        if !kinds.insert(block.kind.as_str()) || !QUALITY_KINDS.contains(&block.kind.as_str()) {
            return Err("Keep one review, worked example, practice task and solution.".to_owned());
        }
        let base_block = base_by_kind.get(block.kind.as_str()).ok_or_else(|| {
            "The adjusted blocks no longer match the original section.".to_owned()
        })?;
        validate_generated_block(block, base_block, &allowed_sources)?;
        changed |= block.text.trim() != base_block.text.trim();
    }
    if !changed {
        return Err(
            "The group section must adapt at least one original material block.".to_owned(),
        );
    }
    Ok(())
}

pub(super) const QUALITY_KINDS: [&str; 4] = ["review", "worked_example", "practice", "solution"];

fn validate_generated_block(
    block: &GeneratedClassworkBlockInput,
    base: &ClassworkBlock,
    allowed_sources: &HashSet<&str>,
) -> Result<()> {
    let text = block.text.trim();
    if text.is_empty() || text.chars().count() > 8_000 {
        return Err("Every adjusted classwork block must contain usable text.".to_owned());
    }
    if canonical_numbers(&block.learning_goal_numbers)
        != canonical_numbers(&base.learning_goal_numbers)
    {
        return Err("Every adjusted block must preserve its original learning goals.".to_owned());
    }
    let mut seen = HashSet::new();
    if block
        .source_material_keys
        .iter()
        .any(|key| !seen.insert(key) || !allowed_sources.contains(key.as_str()))
    {
        return Err(
            "An adjusted block used source material outside its original section.".to_owned(),
        );
    }
    let lower = text.to_lowercase();
    if UNSUPPORTED_PHRASES
        .iter()
        .any(|phrase| lower.contains(phrase))
    {
        return Err(
            "The adjusted block contains unsupported or learner-identifying wording.".to_owned(),
        );
    }
    Ok(())
}

const UNSUPPORTED_PHRASES: [&str; 13] = [
    "you chose",
    "you answered",
    "you got",
    "you missed",
    "your test answer",
    "your test result",
    "solution in the textbook",
    "answer in the textbook",
    "from the textbook",
    "based on the textbook",
    "mirrors the textbook",
    "textbook solution",
    "textbook answer",
];

fn validate_quality_report(report: &ClassworkQualityReport, failed: bool) -> Result<()> {
    let valid_outcome = matches!(
        report.outcome.as_str(),
        "passed" | "repaired" | "scrubbed" | "failed"
    );
    if !valid_outcome || report.passes.is_empty() || report.passes.len() > 3 {
        return Err("The group-classwork quality report is invalid.".to_owned());
    }
    if failed != (report.outcome == "failed") {
        return Err(
            "The group-classwork quality outcome does not match the saved section state."
                .to_owned(),
        );
    }
    for pass in &report.passes {
        if !matches!(pass.stage.as_str(), "initial" | "repair" | "scrub")
            || pass.checks.len() != QUALITY_CHECKS.len()
        {
            return Err("The group-classwork quality checks are incomplete.".to_owned());
        }
        let names = pass
            .checks
            .iter()
            .map(|check| check.check.as_str())
            .collect::<Vec<_>>();
        if names != QUALITY_CHECKS || pass.passed != pass.checks.iter().all(|check| check.passed) {
            return Err("The group-classwork quality checks are inconsistent.".to_owned());
        }
        if pass.checks.iter().any(|check| {
            check.details.len() > 20
                || check
                    .details
                    .iter()
                    .any(|detail| detail.trim().is_empty() || detail.chars().count() > 500)
        }) {
            return Err("A group-classwork quality finding is invalid.".to_owned());
        }
    }
    if !failed && !report.passes.last().is_some_and(|pass| pass.passed) {
        return Err(
            "Only a group section that passed its final quality checks can be saved.".to_owned(),
        );
    }
    Ok(())
}

pub(super) const QUALITY_CHECKS: [&str; 6] = [
    "content_structure",
    "learning_goal_preservation",
    "block_alignment",
    "source_scope",
    "differentiation_presence",
    "unsupported_claims",
];

fn update_run_after_section(transaction: &Transaction<'_>, run_id: &str) -> Result<()> {
    let (pending, failed): (i64, i64) = transaction
        .query_row(
            "SELECT
                SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END),
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)
             FROM differentiated_classwork_sections WHERE run_id = ?1",
            [run_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(db_error)?;
    let status = if pending == 0 {
        "complete"
    } else if failed > 0 {
        "failed"
    } else {
        "paused"
    };
    transaction
        .execute(
            "UPDATE differentiated_classwork_runs SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![status, run_id],
        )
        .map_err(db_error)?;
    Ok(())
}

fn canonical_numbers(values: &[i64]) -> BTreeSet<i64> {
    values.iter().copied().collect()
}

fn clean_error(value: &str) -> String {
    let cleaned = value.trim();
    if cleaned.is_empty() {
        "This group section could not be created. Try it again.".to_owned()
    } else {
        cleaned.chars().take(500).collect()
    }
}
