//! Binds model-drafted plans to the curriculum identities the lesson already
//! holds, resolving sequence references to component and record ids and grounding
//! knowledge items in the supplied evidence.

use super::{
    deterministic_fault, parse, required_output, sequence_index, BoundObjectivePlan,
    GeneratedKnowledgePlan, GranularLessonProgramInput, KnowledgePlan, LessonObjectiveDraft,
    ObjectiveKnowledge, ObjectivePlan,
};
use crate::generation_program::domain::RuntimeFault;
use crate::lesson_planning::granular::{
    KnowledgeComponent, Misconception, PriorKnowledgeItem, SourceEvidenceSnapshot,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn bind_objective_plan(
    input: &Value,
    outputs: &BTreeMap<String, Value>,
) -> Result<BoundObjectivePlan, RuntimeFault> {
    let lesson = parse::<GranularLessonProgramInput>(input, "lesson-planning input")?;
    let generated = parse::<ObjectivePlan>(
        required_output(outputs, "lessonObjectives")?,
        "generated objective plan",
    )?;
    bind_generated_objectives(&lesson, &generated)
}

pub(super) fn bind_generated_objectives(
    lesson: &GranularLessonProgramInput,
    generated: &ObjectivePlan,
) -> Result<BoundObjectivePlan, RuntimeFault> {
    if generated.lesson_objectives.len() != lesson.curriculum_snapshot.atomic_objectives.len() {
        return Err(deterministic_fault(vec![
            "The generated lesson objectives do not match the selected curriculum scope."
                .to_owned(),
        ]));
    }

    let lesson_objectives = generated
        .lesson_objectives
        .iter()
        .zip(&lesson.curriculum_snapshot.atomic_objectives)
        .enumerate()
        .map(|(index, (objective, atomic))| {
            let sequence = u16::try_from(index + 1).map_err(|_| {
                deterministic_fault(vec!["There are too many lesson objectives.".to_owned()])
            })?;
            if objective.sequence != sequence || objective.statement.trim().is_empty() {
                return Err(deterministic_fault(vec![
                    "The generated lesson objectives are incomplete or out of order.".to_owned(),
                ]));
            }
            Ok(LessonObjectiveDraft {
                id: format!("lesson-objective-{sequence}"),
                statement: objective.statement.clone(),
                sequence,
                curriculum_objective_id: atomic.curriculum_objective_id.clone(),
                atomic_objective_id: atomic.id.clone(),
            })
        })
        .collect::<Result<Vec<_>, RuntimeFault>>()?;

    Ok(BoundObjectivePlan { lesson_objectives })
}

pub(super) fn build_knowledge_selection_catalog(
    lesson: &GranularLessonProgramInput,
    objectives: &BoundObjectivePlan,
) -> Result<Value, RuntimeFault> {
    // Which record backs which knowledge component is something the curriculum
    // already states. It is given as the position of the record in the catalogue,
    // so the model confirms an existing link instead of inferring one, and never
    // has to reproduce a record identifier to do it.
    let record_sequences = lesson
        .source_evidence_snapshot
        .records
        .iter()
        .enumerate()
        .map(|(index, record)| (record.record_id.as_str(), index + 1))
        .collect::<BTreeMap<_, _>>();
    let supporting_sequences = |component: &KnowledgeComponent| {
        component
            .supporting_record_ids
            .iter()
            .filter_map(|id| record_sequences.get(id.as_str()).copied())
            .collect::<Vec<_>>()
    };

    let objective_selections = objectives
        .lesson_objectives
        .iter()
        .map(|objective| {
            let candidates = lesson
                .curriculum_snapshot
                .knowledge_components
                .iter()
                .filter(|component| {
                    !component.is_prior_knowledge
                        && component
                            .atomic_objective_ids
                            .contains(&objective.atomic_objective_id)
                })
                .enumerate()
                .map(|(index, component)| {
                    json!({
                        "candidateSequence": index + 1,
                        "description": component.description,
                        "knowledgeType": component.knowledge_type,
                        "supportingRecordSequences": supporting_sequences(component),
                    })
                })
                .collect::<Vec<_>>();
            if candidates.is_empty() {
                return Err(deterministic_fault(vec![format!(
                    "Lesson objective {} has no eligible knowledge component.",
                    objective.sequence
                )]));
            }
            Ok(json!({
                "lessonObjectiveSequence": objective.sequence,
                "statement": objective.statement,
                "candidates": candidates,
            }))
        })
        .collect::<Result<Vec<_>, RuntimeFault>>()?;
    let knowledge_components = lesson
        .curriculum_snapshot
        .knowledge_components
        .iter()
        .enumerate()
        .map(|(index, component)| {
            json!({
                "sequence": index + 1,
                "description": component.description,
                "isPriorKnowledge": component.is_prior_knowledge,
                "supportingRecordSequences": supporting_sequences(component),
            })
        })
        .collect::<Vec<_>>();
    let source_records = lesson
        .source_evidence_snapshot
        .records
        .iter()
        .enumerate()
        .map(|(index, record)| {
            json!({
                "sequence": index + 1,
                "title": record.title,
                "excerpt": record.excerpt,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "objectiveSelections": objective_selections,
        "knowledgeComponents": knowledge_components,
        "sourceRecords": source_records,
    }))
}

pub(super) fn bind_knowledge_plan(
    lesson: &GranularLessonProgramInput,
    objectives: &BoundObjectivePlan,
    outputs: &BTreeMap<String, Value>,
) -> Result<KnowledgePlan, RuntimeFault> {
    let generated = parse::<GeneratedKnowledgePlan>(
        required_output(outputs, "knowledgePlan")?,
        "generated knowledge plan",
    )?;
    resolve_knowledge_plan(lesson, objectives, &generated).map_err(|error| {
        deterministic_fault(vec![format!(
            "The generated knowledge plan could not be aligned: {error}"
        )])
    })
}

pub(super) fn resolve_knowledge_plan(
    lesson: &GranularLessonProgramInput,
    objectives: &BoundObjectivePlan,
    generated: &GeneratedKnowledgePlan,
) -> Result<KnowledgePlan, String> {
    let mut selected_objectives = BTreeSet::new();
    let generated_selections = generated
        .objective_knowledge
        .iter()
        .map(|selection| {
            let objective_index = sequence_index(selection.lesson_objective_sequence)?;
            let objective = objectives
                .lesson_objectives
                .get(objective_index)
                .ok_or_else(|| "A selection uses an unavailable lesson objective.".to_owned())?;
            if !selected_objectives.insert(selection.lesson_objective_sequence) {
                return Err("A lesson objective was selected more than once.".to_owned());
            }
            let candidate_index = sequence_index(selection.candidate_sequence)?;
            let component = lesson
                .curriculum_snapshot
                .knowledge_components
                .iter()
                .filter(|component| {
                    !component.is_prior_knowledge
                        && component
                            .atomic_objective_ids
                            .contains(&objective.atomic_objective_id)
                })
                .nth(candidate_index)
                .ok_or_else(|| "A selection uses an unavailable knowledge candidate.".to_owned())?;
            Ok(ObjectiveKnowledge {
                lesson_objective_id: objective.id.clone(),
                knowledge_component_id: component.id.clone(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let generated_by_objective = generated_selections
        .into_iter()
        .map(|selection| (selection.lesson_objective_id.clone(), selection))
        .collect::<BTreeMap<_, _>>();
    // Every objective needing an explicit choice is named at once, so a repair
    // sees the whole set rather than one at a time. The previous form
    // short-circuited on the first missing selection, and the model kept
    // adding exactly one on retry while the others stayed absent.
    let mut resolved = Vec::with_capacity(objectives.lesson_objectives.len());
    let mut awaiting = Vec::new();
    for objective in &objectives.lesson_objectives {
        if let Some(selection) = generated_by_objective.get(&objective.id) {
            resolved.push(selection.clone());
            continue;
        }
        let candidates = lesson
            .curriculum_snapshot
            .knowledge_components
            .iter()
            .filter(|component| {
                !component.is_prior_knowledge
                    && component
                        .atomic_objective_ids
                        .contains(&objective.atomic_objective_id)
            })
            .collect::<Vec<_>>();
        if candidates.len() == 1 {
            resolved.push(ObjectiveKnowledge {
                lesson_objective_id: objective.id.clone(),
                knowledge_component_id: candidates[0].id.clone(),
            });
        } else {
            awaiting.push(objective.sequence);
        }
    }
    if !awaiting.is_empty() {
        let list = awaiting
            .iter()
            .map(|sequence| sequence.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        // Phrased as a diagnostic, not a directive: the previous repair message
        // ("Return one for each of these") caused the model to replace its
        // output with only the named objectives, dropping the selections it
        // already had right. Describe what is missing and let the repair
        // signature's preserve-valid-content instruction do its job.
        return Err(format!(
            "objectiveKnowledge is missing entries for lesson objectives {list}. \
             Keep every existing objectiveKnowledge entry and add one entry for each missing objective."
        ));
    }
    let objective_knowledge = resolved;

    let misconceptions = generated
        .misconceptions
        .iter()
        .enumerate()
        .map(|(index, item)| {
            Ok(Misconception {
                id: format!("misconception-{}", index + 1),
                statement: item.statement.clone(),
                correction: item.correction.clone(),
                knowledge_component_ids: resolve_component_sequences(
                    &lesson.curriculum_snapshot.knowledge_components,
                    &item.knowledge_component_sequences,
                    false,
                )?,
                supporting_record_ids: resolve_record_sequences(
                    &lesson.source_evidence_snapshot,
                    &item.supporting_record_sequences,
                )?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let prior_knowledge = generated
        .prior_knowledge
        .iter()
        .enumerate()
        .map(|(index, item)| {
            Ok(PriorKnowledgeItem {
                id: format!("prior-knowledge-{}", index + 1),
                statement: item.statement.clone(),
                knowledge_component_ids: resolve_component_sequences(
                    &lesson.curriculum_snapshot.knowledge_components,
                    &item.knowledge_component_sequences,
                    true,
                )?,
                supporting_record_ids: resolve_record_sequences(
                    &lesson.source_evidence_snapshot,
                    &item.supporting_record_sequences,
                )?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let output = KnowledgePlan {
        objective_knowledge,
        misconceptions,
        prior_knowledge,
        instructional_materials: generated.instructional_materials.clone(),
    };
    let components = lesson
        .curriculum_snapshot
        .knowledge_components
        .iter()
        .map(|component| (component.id.as_str(), component))
        .collect::<BTreeMap<_, _>>();
    validate_grounded_items(
        &output.misconceptions,
        &output.prior_knowledge,
        &components,
        &lesson.source_evidence_snapshot,
    )?;
    Ok(output)
}

pub(super) fn resolve_component_sequences(
    components: &[KnowledgeComponent],
    sequences: &[u16],
    require_prior_knowledge: bool,
) -> Result<Vec<String>, String> {
    let eligible = components
        .iter()
        .filter(|component| !require_prior_knowledge || component.is_prior_knowledge)
        .collect::<Vec<_>>();
    if eligible.len() == 1 {
        return Ok(vec![eligible[0].id.clone()]);
    }
    if sequences.is_empty() {
        return Err("Select at least one knowledge component.".to_owned());
    }
    let mut selected = BTreeSet::new();
    sequences
        .iter()
        .map(|sequence| {
            let component = components
                .get(sequence_index(*sequence)?)
                .ok_or_else(|| "A knowledge-component sequence is unavailable.".to_owned())?;
            if require_prior_knowledge && !component.is_prior_knowledge {
                return Err("Prior knowledge must use a component marked as prior.".to_owned());
            }
            if !selected.insert(*sequence) {
                return Err("A knowledge component was selected more than once.".to_owned());
            }
            Ok(component.id.clone())
        })
        .collect()
}

pub(super) fn resolve_record_sequences(
    evidence: &SourceEvidenceSnapshot,
    sequences: &[u16],
) -> Result<Vec<String>, String> {
    if sequences.is_empty() {
        return Err("Select at least one source record.".to_owned());
    }
    let mut selected = BTreeSet::new();
    sequences
        .iter()
        .map(|sequence| {
            let record = evidence
                .records
                .get(sequence_index(*sequence)?)
                .ok_or_else(|| "A source-record sequence is unavailable.".to_owned())?;
            if !selected.insert(*sequence) {
                return Err("A source record was selected more than once.".to_owned());
            }
            Ok(record.record_id.clone())
        })
        .collect()
}

pub(super) fn grounded_item_violations(
    misconceptions: &[Misconception],
    prior_knowledge: &[PriorKnowledgeItem],
    components: &BTreeMap<&str, &KnowledgeComponent>,
    evidence: &SourceEvidenceSnapshot,
) -> Vec<String> {
    let record_ids = evidence
        .records
        .iter()
        .map(|record| record.record_id.as_str())
        .collect::<BTreeSet<_>>();
    let mut violations = Vec::new();
    for misconception in misconceptions {
        if misconception.statement.trim().is_empty()
            || misconception.correction.trim().is_empty()
            || misconception.knowledge_component_ids.is_empty()
            || misconception.supporting_record_ids.is_empty()
            || misconception
                .knowledge_component_ids
                .iter()
                .any(|id| !components.contains_key(id.as_str()))
            || misconception
                .supporting_record_ids
                .iter()
                .any(|id| !record_ids.contains(id.as_str()))
        {
            violations.push("Every common misunderstanding needs aligned knowledge, a correction, and supplied evidence.".to_owned());
        }
    }
    for prior in prior_knowledge {
        if prior.statement.trim().is_empty()
            || prior.knowledge_component_ids.is_empty()
            || prior.supporting_record_ids.is_empty()
            || prior.knowledge_component_ids.iter().any(|id| {
                components
                    .get(id.as_str())
                    .is_none_or(|component| !component.is_prior_knowledge)
            })
            || prior
                .supporting_record_ids
                .iter()
                .any(|id| !record_ids.contains(id.as_str()))
        {
            violations.push(
                "Every prior-knowledge item needs supplied prior knowledge and evidence."
                    .to_owned(),
            );
        }
    }
    violations
}

/// The resolve step needs the first fault only, to fail its transformation.
fn validate_grounded_items(
    misconceptions: &[Misconception],
    prior_knowledge: &[PriorKnowledgeItem],
    components: &BTreeMap<&str, &KnowledgeComponent>,
    evidence: &SourceEvidenceSnapshot,
) -> Result<(), String> {
    match grounded_item_violations(misconceptions, prior_knowledge, components, evidence)
        .into_iter()
        .next()
    {
        Some(first) => Err(first),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {

    use super::*;

    use crate::lesson_planning::program::test_support::*;
    use crate::lesson_planning::program::*;

    #[test]
    fn names_every_multi_candidate_objective_the_model_did_not_select_for() {
        let (lesson, _, mut objectives, knowledge, _, _) = input_and_stage_outputs();
        // Give every objective at least two non-prior candidates by cloning the
        // first non-prior component onto each objective's alignment list; that
        // way the deterministic fallback cannot resolve any of them.
        let sample = lesson
            .curriculum_snapshot
            .knowledge_components
            .iter()
            .find(|component| !component.is_prior_knowledge)
            .expect("a non-prior component")
            .clone();
        let mut lesson_with_choices = lesson.clone();
        for objective in &objectives.lesson_objectives {
            let mut extra = sample.clone();
            extra.id = format!("extra-for-{}", objective.sequence);
            extra.atomic_objective_ids = vec![objective.atomic_objective_id.clone()];
            lesson_with_choices
                .curriculum_snapshot
                .knowledge_components
                .push(extra);
        }
        for component in &mut lesson_with_choices.curriculum_snapshot.knowledge_components {
            if !component.is_prior_knowledge {
                for objective in &objectives.lesson_objectives {
                    if !component
                        .atomic_objective_ids
                        .contains(&objective.atomic_objective_id)
                    {
                        component
                            .atomic_objective_ids
                            .push(objective.atomic_objective_id.clone());
                    }
                }
            }
        }
        let _ = &mut objectives;

        let generated = GeneratedKnowledgePlan {
            objective_knowledge: Vec::new(),
            misconceptions: Vec::new(),
            prior_knowledge: Vec::new(),
            instructional_materials: knowledge.instructional_materials,
        };

        let error = resolve_knowledge_plan(&lesson_with_choices, &objectives, &generated)
            .expect_err("every objective needs an explicit selection");

        for sequence in objectives
            .lesson_objectives
            .iter()
            .map(|objective| objective.sequence)
        {
            assert!(
                error.contains(&sequence.to_string()),
                "the repair message names objective {sequence}: {error}"
            );
        }
    }

    #[test]
    fn deterministically_binds_the_only_knowledge_candidate_for_each_objective() {
        let (lesson, _, objectives, knowledge, _, _) = input_and_stage_outputs();
        let generated = GeneratedKnowledgePlan {
            objective_knowledge: Vec::new(),
            misconceptions: Vec::new(),
            prior_knowledge: Vec::new(),
            instructional_materials: knowledge.instructional_materials,
        };

        let resolved = resolve_knowledge_plan(&lesson, &objectives, &generated)
            .expect("deterministic knowledge binding");

        assert_eq!(resolved.objective_knowledge.len(), 2);
        assert_eq!(
            resolved
                .objective_knowledge
                .iter()
                .map(|selection| selection.knowledge_component_id.as_str())
                .collect::<Vec<_>>(),
            ["knowledge-compare", "knowledge-order"]
        );
    }

    #[test]
    fn deterministically_binds_a_single_grounded_knowledge_component() {
        let (lesson, _, _, _, _, _) = input_and_stage_outputs();
        let component = lesson
            .curriculum_snapshot
            .knowledge_components
            .iter()
            .find(|component| !component.is_prior_knowledge)
            .expect("lesson knowledge")
            .clone();

        let resolved =
            resolve_component_sequences(std::slice::from_ref(&component), &[1, 2, 3], false)
                .expect("single deterministic component");

        assert_eq!(resolved, vec![component.id]);
    }

    /// Record citations are sequences into the evidence the run holds, so a stage
    /// cannot name material the run was not given: the label does not exist. Three
    /// separate runs once shipped a citation to a trimmed record; this is why they
    /// cannot anymore.
    #[test]
    fn a_record_citation_past_the_supplied_evidence_cannot_resolve() {
        let (lesson, _, _, _, _, _) = input_and_stage_outputs();
        let evidence = &lesson.source_evidence_snapshot;
        let count = evidence.records.len();
        assert!(count >= 1, "the golden lesson supplies evidence");

        let last = u16::try_from(count).expect("record count fits a sequence");
        assert_eq!(
            resolve_record_sequences(evidence, &[last]).expect("the last supplied record resolves"),
            vec![evidence.records[count - 1].record_id.clone()]
        );

        let beyond = u16::try_from(count + 1).expect("record count fits a sequence");
        assert!(
            resolve_record_sequences(evidence, &[beyond]).is_err(),
            "one past the supplied set is not a citable label"
        );
    }
}
