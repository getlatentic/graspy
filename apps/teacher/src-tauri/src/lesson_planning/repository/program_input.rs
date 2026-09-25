use std::collections::BTreeSet;

use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::content_corpus::ContentCorpus;
use crate::db::Database;

use super::{
    goals_fingerprint, resolve_context, RepositoryError, RepositoryResult, ResolvedContext,
};
use crate::lesson_planning::domain::GranularLessonProgramInputRequest;
use crate::lesson_planning::granular::{
    AtomicObjective, BloomLevel, CurriculumObjectiveRef, CurriculumSnapshot, KnowledgeComponent,
    KnowledgeType, SourceEvidenceFigure, SourceEvidenceRecord, SourceEvidenceSnapshot,
};
use crate::lesson_planning::program::GranularLessonProgramInput;

pub(in crate::lesson_planning) fn get_granular_program_input(
    database: &Database,
    corpus: &ContentCorpus,
    request: GranularLessonProgramInputRequest,
) -> Result<GranularLessonProgramInput, String> {
    let scope = database.with_connection(|connection| {
        let context = resolve_context(connection, &request.context)?;
        load_granular_scope(connection, &context, &request.lesson_id)
    })?;
    let source_evidence_snapshot = load_source_evidence(corpus, &scope.source_record_ids)?;
    // The corpus caps how much evidence a lesson carries, so a component can
    // cite more than the run was handed. Every later stage checks its work
    // against the evidence snapshot, so the snapshot is the authority and the
    // citations are narrowed to it here — once, rather than in each consumer.
    let mut curriculum_snapshot = scope.curriculum_snapshot;
    narrow_citations_to_supplied_evidence(&mut curriculum_snapshot, &source_evidence_snapshot);
    let input = GranularLessonProgramInput {
        topic: scope.topic,
        subtopic: scope.subtopic,
        teacher_source: scope.teacher_source,
        lesson_duration_minutes: request.lesson_duration_minutes,
        curriculum_snapshot,
        source_evidence_snapshot,
    };
    input.validate()?;
    Ok(input)
}

/// Keep only the citations the run can actually show.
///
/// A knowledge component names every record its curriculum links to it, which
/// can exceed the excerpt budget. The final plan check refuses a component that
/// cites material outside the saved evidence, so the two must agree before the
/// program starts rather than eight stages in.
pub(super) fn narrow_citations_to_supplied_evidence(
    curriculum_snapshot: &mut CurriculumSnapshot,
    evidence: &SourceEvidenceSnapshot,
) {
    let supplied = evidence
        .records
        .iter()
        .map(|record| record.record_id.as_str())
        .collect::<BTreeSet<_>>();
    for component in &mut curriculum_snapshot.knowledge_components {
        component
            .supporting_record_ids
            .retain(|record_id| supplied.contains(record_id.as_str()));
    }
}

pub(in crate::lesson_planning) fn load_source_evidence(
    corpus: &ContentCorpus,
    source_record_ids: &[String],
) -> Result<SourceEvidenceSnapshot, String> {
    let excerpts = corpus.resolve_record_ids(source_record_ids)?;
    // Figures follow the records that survived the excerpt budget, not the
    // records that were asked for. Resolving them from the full list attached
    // figures to material the run does not hold, and the completed plan was
    // refused for a figure referring to unavailable source material.
    let resolved_ids = excerpts
        .iter()
        .map(|excerpt| excerpt.record_id.clone())
        .collect::<Vec<_>>();
    let figures = corpus.resolve_figures(&resolved_ids)?;
    Ok(SourceEvidenceSnapshot {
        records: excerpts
            .into_iter()
            .map(|excerpt| SourceEvidenceRecord {
                record_id: excerpt.record_id,
                title: excerpt.title,
                excerpt_sha256: format!("{:x}", Sha256::digest(excerpt.text.as_bytes())),
                excerpt: excerpt.text,
                attribution: excerpt.attribution.attribution,
            })
            .collect(),
        figures: figures
            .into_iter()
            .map(|figure| SourceEvidenceFigure {
                source_record_id: figure.record_id,
                asset_file_name: figure.asset_file_name,
                sha256: figure.sha256,
                caption: figure.caption,
                alt_text: figure.alt_text,
            })
            .collect(),
    })
}

pub(super) struct GranularScope {
    pub(super) topic: String,
    pub(super) subtopic: Option<String>,
    pub(super) teacher_source: Option<String>,
    pub(super) curriculum_snapshot: CurriculumSnapshot,
    pub(super) source_record_ids: Vec<String>,
}

/// The scope for a lesson with no curriculum behind it, taught against the
/// objectives and knowledge derived from what the teacher wrote.
///
/// The derived curriculum is worked out once, when the teacher asks for
/// classwork, and kept with the lesson. Goals that have since been edited no
/// longer match the fingerprint it was derived from, and the lesson is sent back
/// to be worked out again rather than taught against goals it no longer has.
fn load_teacher_authored_scope(
    connection: &Connection,
    context: &ResolvedContext,
    lesson_id: &str,
) -> RepositoryResult<GranularScope> {
    let (topic, subtopic, teacher_source, goals) = connection
        .query_row(
            "SELECT topic, subtopic, COALESCE(source_plan_text, raw_plan), learning_goals
             FROM lessons
             WHERE id = ?1 AND academic_period_id = ?2 AND teaching_assignment_id = ?3
               AND status = 'draft' AND curriculum_course_id IS NULL",
            params![lesson_id, context.period_id, context.assignment_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| RepositoryError::Conflict("Choose a draft lesson to prepare.".to_owned()))?;

    let stored = connection
        .query_row(
            "SELECT goals_fingerprint, snapshot, source_record_ids
             FROM lesson_teacher_curriculum WHERE lesson_id = ?1",
            params![lesson_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Conflict(
                "This lesson needs its learning goals worked through before its classwork can be written."
                    .to_owned(),
            )
        })?;

    if stored.0 != goals_fingerprint(&goals) {
        return Err(RepositoryError::Conflict(
            "The learning goals changed after this lesson was worked through. Work through it again to match them."
                .to_owned(),
        ));
    }

    Ok(GranularScope {
        topic,
        subtopic,
        teacher_source,
        curriculum_snapshot: serde_json::from_str(&stored.1).map_err(|_| {
            RepositoryError::Conflict(
                "This lesson's learning goals could not be read. Work through it again.".to_owned(),
            )
        })?,
        source_record_ids: serde_json::from_str(&stored.2).map_err(|_| {
            RepositoryError::Conflict(
                "This lesson's sources could not be read. Work through it again.".to_owned(),
            )
        })?,
    })
}

pub(super) fn load_granular_scope(
    connection: &Connection,
    context: &ResolvedContext,
    lesson_id: &str,
) -> RepositoryResult<GranularScope> {
    let base = connection
        .query_row(
            "SELECT lessons.topic, lessons.subtopic,
                    COALESCE(lessons.source_plan_text, lessons.raw_plan),
                    curriculum_packages.id, curriculum_packages.title,
                    curriculum_packages.payload_sha256, curriculum_courses.id,
                    scheme_entries.curriculum_node_id, scheme_entries.id
             FROM lessons
             JOIN scheme_entries ON scheme_entries.id = lessons.scheme_entry_id
             JOIN curriculum_courses ON curriculum_courses.id = lessons.curriculum_course_id
             JOIN curriculum_frameworks
               ON curriculum_frameworks.id = curriculum_courses.framework_id
             JOIN curriculum_packages
               ON curriculum_packages.id = curriculum_frameworks.package_id
             WHERE lessons.id = ?1
               AND lessons.academic_period_id = ?2
               AND lessons.teaching_assignment_id = ?3
               AND lessons.status = 'draft'",
            params![lesson_id, context.period_id, context.assignment_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, String>(8)?,
                ))
            },
        )
        .optional()?;
    // A lesson the teacher wrote themselves has no scheme entry to join to. It is
    // taught against the curriculum derived from their own goals instead.
    let Some(base) = base else {
        return load_teacher_authored_scope(connection, context, lesson_id);
    };
    let curriculum_node_id = base.7.ok_or_else(|| {
        RepositoryError::Conflict(
            "This scheme entry uses an older curriculum format. Review and upgrade it before preparing a detailed lesson."
                .to_owned(),
        )
    })?;
    let mut objectives_statement = connection.prepare(
        "SELECT DISTINCT curriculum_nodes.id,
                COALESCE(curriculum_nodes.statement, curriculum_nodes.title)
         FROM scheme_entry_atomic_objectives
         JOIN atomic_learning_objectives
           ON atomic_learning_objectives.id = scheme_entry_atomic_objectives.atomic_objective_id
         JOIN curriculum_nodes
           ON curriculum_nodes.id = atomic_learning_objectives.curriculum_node_id
         WHERE scheme_entry_atomic_objectives.scheme_entry_id = ?1
         ORDER BY curriculum_nodes.sequence, curriculum_nodes.id",
    )?;
    let curriculum_objectives = objectives_statement
        .query_map([&base.8], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .enumerate()
        .map(|(index, row)| {
            let (id, statement) = row?;
            Ok(CurriculumObjectiveRef {
                id,
                statement,
                sequence: u16::try_from(index + 1).map_err(|_| {
                    rusqlite::Error::IntegralValueOutOfRange(index + 1, index as i64)
                })?,
            })
        })
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    let mut atomic_statement = connection.prepare(
        "SELECT atomic_learning_objectives.id,
                atomic_learning_objectives.curriculum_node_id,
                atomic_learning_objectives.statement,
                atomic_learning_objectives.bloom_verb,
                atomic_learning_objectives.bloom_level
         FROM scheme_entry_atomic_objectives
         JOIN atomic_learning_objectives
           ON atomic_learning_objectives.id = scheme_entry_atomic_objectives.atomic_objective_id
         WHERE scheme_entry_atomic_objectives.scheme_entry_id = ?1
         ORDER BY atomic_learning_objectives.sequence, atomic_learning_objectives.id",
    )?;
    let atomic_objectives = atomic_statement
        .query_map([&base.8], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?
        .enumerate()
        .map(|(index, row)| {
            let (id, curriculum_objective_id, statement, bloom_verb, bloom_level) = row?;
            Ok(AtomicObjective {
                id,
                curriculum_objective_id,
                statement,
                bloom_verb: bloom_verb.ok_or_else(|| {
                    RepositoryError::Conflict(
                        "A selected curriculum objective is missing its action verb.".to_owned(),
                    )
                })?,
                bloom_level: parse_bloom_level(bloom_level.as_deref())?,
                sequence: u16::try_from(index + 1).map_err(|_| {
                    RepositoryError::Conflict(
                        "The selected curriculum entry has too many objectives.".to_owned(),
                    )
                })?,
            })
        })
        .collect::<RepositoryResult<Vec<_>>>()?;
    if atomic_objectives.is_empty() {
        return Err(RepositoryError::Conflict(
            "This scheme entry has no focused curriculum objectives.".to_owned(),
        ));
    }
    let selected_atomic_ids = atomic_objectives
        .iter()
        .map(|objective| objective.id.clone())
        .collect::<BTreeSet<_>>();
    let knowledge_components =
        load_scope_knowledge(connection, &base.6, &selected_atomic_ids, &base.8)?;
    let mut source_record_ids = query_strings(
        connection,
        "SELECT record_id FROM scheme_entry_source_records
         WHERE scheme_entry_id = ?1 ORDER BY sequence",
        &base.8,
    )?;
    if source_record_ids.is_empty() {
        let mut source_statement = connection.prepare(
            "SELECT DISTINCT curriculum_source_links.record_id
             FROM curriculum_source_links
             JOIN scheme_entry_atomic_objectives
               ON scheme_entry_atomic_objectives.atomic_objective_id = curriculum_source_links.atomic_objective_id
             WHERE scheme_entry_atomic_objectives.scheme_entry_id = ?1
             ORDER BY curriculum_source_links.sequence, curriculum_source_links.record_id",
        )?;
        source_record_ids = source_statement
            .query_map([&base.8], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
    }
    source_record_ids = evidence_in_priority_order(&knowledge_components, source_record_ids);
    if source_record_ids.is_empty() {
        return Err(RepositoryError::Conflict(
            "This scheme entry has no installed source material.".to_owned(),
        ));
    }
    Ok(GranularScope {
        topic: base.0,
        subtopic: base.1,
        teacher_source: base.2,
        curriculum_snapshot: CurriculumSnapshot {
            package_id: Some(base.3),
            package_title: Some(base.4),
            package_sha256: Some(base.5),
            course_id: Some(base.6),
            curriculum_node_id: Some(curriculum_node_id),
            objectives: curriculum_objectives,
            atomic_objectives,
            knowledge_components,
        },
        source_record_ids,
    })
}

/// The order the corpus should spend its excerpt budget in.
///
/// What the selected knowledge cites comes first: an assessment inherits those
/// record ids and is rejected if the run was not given them. The corpus caps
/// how many excerpts a lesson may carry and keeps whatever arrives first, so
/// with the whole list sorted alphabetically the budget went to the scheme
/// entry's own records and every cited one was cut — assessments then cited
/// evidence the run did not hold, three stages later and with no sign of why.
pub(super) fn evidence_in_priority_order(
    knowledge_components: &[KnowledgeComponent],
    entry_records: Vec<String>,
) -> Vec<String> {
    let mut ordered = knowledge_components
        .iter()
        .flat_map(|component| component.supporting_record_ids.iter().cloned())
        .collect::<Vec<_>>();
    ordered.extend(entry_records);
    let mut seen = BTreeSet::new();
    ordered
        .into_iter()
        .filter(|record_id| seen.insert(record_id.clone()))
        .collect()
}

fn load_scope_knowledge(
    connection: &Connection,
    course_id: &str,
    selected_atomic_ids: &BTreeSet<String>,
    scheme_entry_id: &str,
) -> RepositoryResult<Vec<KnowledgeComponent>> {
    let mut statement = connection.prepare(
        "WITH RECURSIVE selected(id) AS (
             SELECT DISTINCT knowledge_component_objectives.knowledge_component_id
             FROM knowledge_component_objectives
             JOIN scheme_entry_atomic_objectives
               ON scheme_entry_atomic_objectives.atomic_objective_id = knowledge_component_objectives.atomic_objective_id
             WHERE scheme_entry_atomic_objectives.scheme_entry_id = ?1
         ), closure(id) AS (
             SELECT id FROM selected
             UNION
             SELECT knowledge_component_prerequisites.prerequisite_knowledge_component_id
             FROM knowledge_component_prerequisites
             JOIN closure
               ON closure.id = knowledge_component_prerequisites.knowledge_component_id
         )
         SELECT knowledge_components.id, knowledge_components.description,
                knowledge_components.knowledge_type, knowledge_components.bloom_level
         FROM closure
         JOIN knowledge_components ON knowledge_components.id = closure.id
         WHERE knowledge_components.curriculum_course_id = ?2
         ORDER BY knowledge_components.code, knowledge_components.id",
    )?;
    let rows = statement
        .query_map(params![scheme_entry_id, course_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut components = Vec::with_capacity(rows.len());
    for (id, description, knowledge_type, bloom_level) in rows {
        let atomic_objective_ids = query_strings_with_course(
            connection,
            "SELECT atomic_objective_id FROM knowledge_component_objectives
             WHERE knowledge_component_id = ?1 AND curriculum_course_id = ?2
             ORDER BY atomic_objective_id",
            &id,
            course_id,
        )?;
        let prerequisites = query_strings_with_course(
            connection,
            "SELECT prerequisite_knowledge_component_id
             FROM knowledge_component_prerequisites
             WHERE knowledge_component_id = ?1 AND curriculum_course_id = ?2
             ORDER BY prerequisite_knowledge_component_id",
            &id,
            course_id,
        )?;
        let mut supporting_record_ids = Vec::new();
        for atomic_id in &atomic_objective_ids {
            let mut ids = query_strings(
                connection,
                "SELECT record_id FROM curriculum_source_links
                 WHERE atomic_objective_id = ?1 ORDER BY sequence",
                atomic_id,
            )?;
            supporting_record_ids.append(&mut ids);
        }
        supporting_record_ids.sort();
        supporting_record_ids.dedup();
        if supporting_record_ids.is_empty() {
            supporting_record_ids = query_strings(
                connection,
                "SELECT record_id FROM scheme_entry_source_records
                 WHERE scheme_entry_id = ?1 ORDER BY sequence",
                scheme_entry_id,
            )?;
        }
        let is_prior_knowledge = atomic_objective_ids
            .iter()
            .all(|id| !selected_atomic_ids.contains(id));
        components.push(KnowledgeComponent {
            id,
            description,
            knowledge_type: parse_knowledge_type(knowledge_type.as_deref())?,
            bloom_level: parse_bloom_level(bloom_level.as_deref())?,
            atomic_objective_ids,
            prerequisite_knowledge_component_ids: prerequisites,
            supporting_record_ids,
            source_form: None,
            target_form: None,
            is_prior_knowledge,
        });
    }
    for objective_id in selected_atomic_ids {
        if components.iter().any(|component| {
            !component.is_prior_knowledge && component.atomic_objective_ids.contains(objective_id)
        }) {
            continue;
        }
        // Named by what it asks a learner to do. A teacher chose this goal from
        // their own plan and has to know which one to change.
        let goal = connection
            .query_row(
                "SELECT statement FROM atomic_learning_objectives WHERE id = ?1",
                [objective_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        return Err(RepositoryError::Conflict(match goal {
            Some(statement) => format!(
                "There is nothing in your curriculum for graspy to teach “{statement}” from. \
                 Choose a different learning goal for this lesson, or write this one yourself \
                 from its topic and goals."
            ),
            None => "One of this lesson's learning goals is no longer in your curriculum. \
                     Reopen the lesson and choose its learning goals again."
                .to_owned(),
        }));
    }
    Ok(components)
}

fn query_strings(connection: &Connection, sql: &str, value: &str) -> RepositoryResult<Vec<String>> {
    let mut statement = connection.prepare(sql)?;
    let values = statement
        .query_map([value], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

fn query_strings_with_course(
    connection: &Connection,
    sql: &str,
    value: &str,
    course_id: &str,
) -> RepositoryResult<Vec<String>> {
    let mut statement = connection.prepare(sql)?;
    let values = statement
        .query_map(params![value, course_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values)
}

fn parse_bloom_level(value: Option<&str>) -> RepositoryResult<BloomLevel> {
    match value {
        Some("remember") => Ok(BloomLevel::Remember),
        Some("understand") => Ok(BloomLevel::Understand),
        Some("apply") => Ok(BloomLevel::Apply),
        Some("analyze") => Ok(BloomLevel::Analyze),
        Some("evaluate") => Ok(BloomLevel::Evaluate),
        Some("create") => Ok(BloomLevel::Create),
        _ => Err(RepositoryError::Conflict(
            "A selected curriculum objective has no supported thinking level.".to_owned(),
        )),
    }
}

fn parse_knowledge_type(value: Option<&str>) -> RepositoryResult<KnowledgeType> {
    match value {
        Some("concept") => Ok(KnowledgeType::Concept),
        Some("procedure") => Ok(KnowledgeType::Procedure),
        Some("representation") => Ok(KnowledgeType::Representation),
        _ => Err(RepositoryError::Conflict(
            "A selected knowledge component has no supported teaching type.".to_owned(),
        )),
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn evidence_order_spends_the_excerpt_budget_on_what_the_knowledge_cites() {
        use crate::lesson_planning::granular::{BloomLevel, KnowledgeComponent, KnowledgeType};
        let component = |records: &[&str]| KnowledgeComponent {
            id: "knowledge-1".to_owned(),
            description: "Place value".to_owned(),
            knowledge_type: KnowledgeType::Concept,
            bloom_level: BloomLevel::Understand,
            atomic_objective_ids: vec!["atomic-1".to_owned()],
            prerequisite_knowledge_component_ids: Vec::new(),
            supporting_record_ids: records.iter().map(|id| (*id).to_string()).collect(),
            source_form: None,
            target_form: None,
            is_prior_knowledge: false,
        };
        let entry_records = (1..=12)
            .map(|index| format!("ch01-b{index:03}"))
            .collect::<Vec<_>>();

        let ordered = super::evidence_in_priority_order(
            &[component(&["ch01-b035", "ch01-b038"])],
            entry_records.clone(),
        );

        assert_eq!(
            &ordered[..2],
            &["ch01-b035".to_owned(), "ch01-b038".to_owned()],
            "cited evidence survives a budget the entry's own records would fill"
        );
        assert!(
            ordered.contains(&"ch01-b001".to_owned()),
            "the entry still contributes"
        );
        assert_eq!(
            ordered.len(),
            14,
            "every record appears once, cited first then the rest"
        );
    }

    /// Priority ordering keeps the cited records that fit the budget; when a
    /// component cites more than the budget can hold, the overflow citation is
    /// reconciled to what the run received, so the plan check downstream cannot
    /// refuse a component for citing evidence the run never held.

    #[test]
    fn a_citation_beyond_the_supplied_evidence_is_reconciled_to_what_the_run_holds() {
        use crate::lesson_planning::granular::{
            BloomLevel, CurriculumSnapshot, KnowledgeComponent, KnowledgeType,
            SourceEvidenceRecord, SourceEvidenceSnapshot,
        };
        let mut snapshot = CurriculumSnapshot {
            package_id: None,
            package_title: None,
            package_sha256: None,
            course_id: None,
            curriculum_node_id: None,
            objectives: Vec::new(),
            atomic_objectives: Vec::new(),
            knowledge_components: vec![KnowledgeComponent {
                id: "knowledge-1".to_owned(),
                description: "Place value".to_owned(),
                knowledge_type: KnowledgeType::Concept,
                bloom_level: BloomLevel::Understand,
                atomic_objective_ids: vec!["atomic-1".to_owned()],
                prerequisite_knowledge_component_ids: Vec::new(),
                supporting_record_ids: vec!["held".to_owned(), "trimmed".to_owned()],
                source_form: None,
                target_form: None,
                is_prior_knowledge: false,
            }],
        };
        let evidence = SourceEvidenceSnapshot {
            records: vec![SourceEvidenceRecord {
                record_id: "held".to_owned(),
                title: "Held".to_owned(),
                excerpt: "Counting in millions.".to_owned(),
                excerpt_sha256: "a".repeat(64),
                attribution: "Installed source".to_owned(),
            }],
            figures: Vec::new(),
        };

        super::narrow_citations_to_supplied_evidence(&mut snapshot, &evidence);

        assert_eq!(
            snapshot.knowledge_components[0].supporting_record_ids,
            vec!["held".to_owned()],
            "the citation to the trimmed record does not survive into a run that lacks it"
        );
    }
}
