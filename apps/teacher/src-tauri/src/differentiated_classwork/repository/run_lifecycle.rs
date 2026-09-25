use std::collections::BTreeSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::classwork::domain::{ClassworkBlock, ClassworkSource, ConfirmedLessonContext};
use crate::db::Database;
use crate::differentiated_classwork::domain::*;

use super::queries::load_workspace;
use super::{
    confirmed_lesson, db_error, json, lesson_for_run, new_id, parse_json, require_active_token,
    require_approved_base_run, require_complete_evidence, Result,
};

pub(in crate::differentiated_classwork) fn start_run(
    database: &Database,
    request: StartDifferentiatedRunRequest,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot> {
    database.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = confirmed_lesson(&transaction, &request.context, &request.lesson_id)?;
        let base_run_id = require_approved_base_run(&transaction, &lesson.lesson_version_id)?;
        let (evidence_set_id, evidence_revision) =
            require_complete_evidence(&transaction, &lesson.lesson_version_id)?;
        let existing = transaction
            .query_row(
                "SELECT id FROM differentiated_classwork_runs
                 WHERE base_run_id = ?1 AND evidence_set_id = ?2 AND evidence_revision = ?3",
                params![base_run_id, evidence_set_id, evidence_revision],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_error)?;
        if existing.is_none() {
            create_run(
                &transaction,
                &lesson,
                &base_run_id,
                &evidence_set_id,
                evidence_revision,
            )?;
        }
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::differentiated_classwork) fn cancel_run(
    database: &Database,
    request: CancelDifferentiatedRunRequest,
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
        transaction
            .execute(
                "UPDATE differentiated_classwork_sections
                 SET status = 'pending', generation_token = NULL, last_error = NULL,
                     quality_report = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                [&request.section_id],
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "UPDATE differentiated_classwork_runs
                 SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                [&request.run_id],
            )
            .map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

fn create_run(
    transaction: &Transaction<'_>,
    lesson: &ConfirmedLessonContext,
    base_run_id: &str,
    evidence_set_id: &str,
    evidence_revision: i64,
) -> Result<()> {
    let base_sections = load_complete_base_sections(transaction, base_run_id)?;
    if base_sections.is_empty() {
        return Err("Create the original classwork before creating group classwork.".to_owned());
    }
    let groups = derive_group_snapshots(transaction, evidence_set_id, &lesson.learning_goals)?;
    if groups.len() != 3 {
        return Err(
            "Finished class results must contain exactly three teaching groups.".to_owned(),
        );
    }
    let run_id = new_id("group-classwork-run");
    transaction
        .execute(
            "INSERT INTO differentiated_classwork_runs
             (id, lesson_id, lesson_version_id, base_run_id, evidence_set_id, evidence_revision)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                run_id,
                lesson.lesson_id,
                lesson.lesson_version_id,
                base_run_id,
                evidence_set_id,
                evidence_revision,
            ],
        )
        .map_err(db_error)?;
    for group in groups {
        let group_id = new_id("group-classwork-group");
        transaction
            .execute(
                "INSERT INTO differentiated_classwork_groups
                 (id, run_id, evidence_group_id, position, name,
                  learner_state_snapshot, session_signals_snapshot)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    group_id,
                    run_id,
                    group.evidence_group_id,
                    group.position,
                    group.name,
                    json(&group.learning_goals)?,
                    json(&group.session_signals)?,
                ],
            )
            .map_err(db_error)?;
        for base_section in &base_sections {
            let sources = scoped_sources_for_base_section(transaction, base_run_id, base_section)?;
            transaction
                .execute(
                    "INSERT INTO differentiated_classwork_sections
                     (id, run_id, group_id, base_section_id, sequence, step_title,
                      base_section_snapshot, source_materials_snapshot)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        new_id("group-classwork-section"),
                        run_id,
                        group_id,
                        base_section.id,
                        base_section.sequence,
                        base_section.step_title,
                        json(base_section)?,
                        json(&sources)?,
                    ],
                )
                .map_err(db_error)?;
        }
    }
    Ok(())
}

struct GroupSnapshot {
    evidence_group_id: String,
    position: i64,
    name: String,
    learning_goals: Vec<PersonalisationLearningGoalState>,
    session_signals: PersonalisationSessionSignals,
}

/// Where a group's readiness tier begins.
///
/// These live here and nowhere else. The teacher-facing sentence that explains
/// a placement — `readinessTiers[...].placedBy` in
/// `src/features/learner-evidence/domain/learnerState.ts` — describes these two
/// numbers in words, so moving one without the other tells a teacher something
/// untrue about their own class. The test below pins them for that reason.
const REINFORCE_FROM: f64 = 0.5;
const EXTEND_FROM: f64 = 0.75;

/// The readiness tier a mastery score places a group in.
fn mastery_band_for(mastery: f64) -> &'static str {
    if mastery < REINFORCE_FROM {
        "remediate"
    } else if mastery < EXTEND_FROM {
        "reinforce"
    } else {
        "extend"
    }
}

fn derive_group_snapshots(
    transaction: &Transaction<'_>,
    evidence_set_id: &str,
    learning_goals: &[String],
) -> Result<Vec<GroupSnapshot>> {
    let mut statement = transaction
        .prepare(
            "SELECT id, position, name, interest_score, lesson_feeling_score
             FROM lesson_evidence_groups WHERE evidence_set_id = ?1 ORDER BY position",
        )
        .map_err(db_error)?;
    let group_rows = statement
        .query_map([evidence_set_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<i64>>(4)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let mut result = Vec::with_capacity(group_rows.len());
    for (group_id, position, name, interest, feeling) in group_rows {
        let mut entries = transaction
            .prepare(
                "SELECT learning_goal_number, questions_correct, questions_total,
                        misunderstanding_note, confidence_score, difficulty_score
                 FROM lesson_evidence_entries
                 WHERE evidence_set_id = ?1 AND group_id = ?2 ORDER BY learning_goal_number",
            )
            .map_err(db_error)?;
        let rows = entries
            .query_map(params![evidence_set_id, group_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                ))
            })
            .map_err(db_error)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)?;
        if rows.len() != learning_goals.len() {
            return Err(
                "Finished class results no longer match the confirmed learning goals.".to_owned(),
            );
        }
        let mut states = Vec::with_capacity(rows.len());
        for (goal_number, correct, total, note, confidence, difficulty) in rows {
            let goal = learning_goals
                .get((goal_number - 1) as usize)
                .ok_or_else(|| {
                    "Finished class results contain an unknown learning goal.".to_owned()
                })?;
            let (correct, total) = correct.zip(total).ok_or_else(|| {
                "Finish every class result before creating group classwork.".to_owned()
            })?;
            if total < 1 || correct < 0 || correct > total {
                return Err(
                    "A finished class-result score is invalid. Reopen the class results."
                        .to_owned(),
                );
            }
            let mastery = correct as f64 / total as f64;
            let mastery_band = mastery_band_for(mastery);
            states.push(PersonalisationLearningGoalState {
                learning_goal_number: goal_number,
                learning_goal: goal.clone(),
                mastery_band: mastery_band.to_owned(),
                mastery: format!("{correct} of {total} exit-test questions correct"),
                confidence: score_phrase(confidence, &CONFIDENCE_LABELS)?,
                perceived_difficulty: score_phrase(difficulty, &DIFFICULTY_LABELS)?,
                common_misunderstanding: note.and_then(trimmed_or_none),
            });
        }
        result.push(GroupSnapshot {
            evidence_group_id: group_id,
            position,
            name,
            learning_goals: states,
            session_signals: PersonalisationSessionSignals {
                interest: score_phrase(interest, &INTEREST_LABELS)?,
                lesson_feeling: score_phrase(feeling, &FEELING_LABELS)?,
            },
        });
    }
    Ok(result)
}

const CONFIDENCE_LABELS: [&str; 5] = [
    "not sure at all",
    "a little sure",
    "somewhat sure",
    "mostly sure",
    "very sure",
];
const DIFFICULTY_LABELS: [&str; 5] = ["very easy", "easy", "okay", "difficult", "very difficult"];
const INTEREST_LABELS: [&str; 5] = [
    "not interested",
    "a little interested",
    "somewhat interested",
    "interested",
    "very interested",
];
const FEELING_LABELS: [&str; 5] = [
    "very confused",
    "still unsure",
    "getting there",
    "mostly clear",
    "very clear",
];

fn score_phrase(score: Option<i64>, labels: &[&str; 5]) -> Result<Option<String>> {
    score
        .map(|value| {
            labels
                .get((value - 1) as usize)
                .map(|label| format!("{label} ({value}/5)"))
                .ok_or_else(|| "A saved lesson rating is outside the 1 to 5 scale.".to_owned())
        })
        .transpose()
}

fn load_complete_base_sections(
    connection: &Connection,
    base_run_id: &str,
) -> Result<Vec<DifferentiatedClassworkBaseSection>> {
    let mut statement = connection
        .prepare(
            "SELECT sections.id, sections.sequence, sections.step_title,
                    document_sections.title, document_sections.learning_goal_numbers
             FROM classwork_sections sections
             JOIN classwork_runs runs ON runs.id = sections.run_id
             JOIN classwork_document_versions versions
               ON versions.run_id = runs.id
              AND versions.version_number = runs.current_document_version_number
              AND versions.status = 'approved'
             JOIN classwork_document_sections document_sections
               ON document_sections.document_version_id = versions.id
              AND document_sections.base_section_id = sections.id
             WHERE sections.run_id = ?1 AND sections.status = 'done'
             ORDER BY sections.sequence",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map([base_run_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    rows.into_iter()
        .map(|(id, sequence, step_title, title, goal_json)| {
            Ok(DifferentiatedClassworkBaseSection {
                blocks: load_base_blocks(connection, &id)?,
                id,
                sequence,
                step_title,
                title,
                learning_goal_numbers: parse_json(&goal_json, "original learning goals")?,
            })
        })
        .collect()
}

fn load_base_blocks(connection: &Connection, section_id: &str) -> Result<Vec<ClassworkBlock>> {
    let mut statement = connection
        .prepare(
            "SELECT blocks.id, blocks.kind, version_blocks.text, version_blocks.teacher_edited,
                    version_blocks.learning_goal_numbers, version_blocks.source_material_keys
             FROM classwork_blocks blocks
             JOIN classwork_sections sections ON sections.id = blocks.section_id
             JOIN classwork_runs runs ON runs.id = sections.run_id
             JOIN classwork_document_versions versions
               ON versions.run_id = runs.id
              AND versions.version_number = runs.current_document_version_number
              AND versions.status = 'approved'
             JOIN classwork_document_blocks version_blocks
               ON version_blocks.document_version_id = versions.id
              AND version_blocks.base_block_id = blocks.id
             WHERE blocks.section_id = ?1 ORDER BY blocks.sequence",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map([section_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, bool>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let mut blocks = Vec::with_capacity(rows.len());
    for (id, kind, text, teacher_edited, goal_json, source_json) in rows {
        blocks.push(ClassworkBlock {
            learning_goal_numbers: parse_json(&goal_json, "original block learning goals")?,
            source_material_keys: parse_json(&source_json, "original block sources")?,
            id,
            kind,
            text,
            teacher_edited,
        });
    }
    if blocks.len() != 4 {
        return Err(
            "Every original section must contain review, example, practice and solution blocks."
                .to_owned(),
        );
    }
    Ok(blocks)
}

fn scoped_sources_for_base_section(
    connection: &Connection,
    base_run_id: &str,
    base_section: &DifferentiatedClassworkBaseSection,
) -> Result<Vec<ClassworkSource>> {
    let keys = base_section
        .blocks
        .iter()
        .flat_map(|block| block.source_material_keys.iter().cloned())
        .collect::<BTreeSet<_>>();
    let mut sources = Vec::with_capacity(keys.len());
    for key in keys {
        let source = connection
            .query_row(
                "SELECT source_key, title, text, publisher, source_url,
                        licence_name, licence_url, attribution
                 FROM classwork_sources WHERE run_id = ?1 AND source_key = ?2",
                params![base_run_id, key],
                |row| {
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
                },
            )
            .optional()
            .map_err(db_error)?
            .ok_or_else(|| "An original section source is no longer available.".to_owned())?;
        sources.push(source);
    }
    Ok(sources)
}

fn trimmed_or_none(value: String) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The boundaries are described to teachers in words, in
    /// `learnerState.ts`: "fewer than half", "between half and three quarters",
    /// "three quarters or more". This fails if the numbers move, because that
    /// prose then says something untrue and has to move with them.
    #[test]
    fn a_readiness_tier_begins_where_the_teacher_is_told_it_does() {
        assert_eq!(
            REINFORCE_FROM, 0.5,
            "\"fewer than half\" is what a teacher is told"
        );
        assert_eq!(
            EXTEND_FROM, 0.75,
            "\"three quarters or more\" is what a teacher is told",
        );

        assert_eq!(mastery_band_for(0.0), "remediate");
        assert_eq!(mastery_band_for(0.499), "remediate");
        // The boundary belongs to the tier above it: exactly half is not
        // "fewer than half".
        assert_eq!(mastery_band_for(0.5), "reinforce");
        assert_eq!(mastery_band_for(0.749), "reinforce");
        assert_eq!(mastery_band_for(0.75), "extend");
        assert_eq!(mastery_band_for(1.0), "extend");
    }
}
