//! The golden lesson every stage of the program is tested against.
//!
//! One ordering-fractions lesson and the output of each stage that runs on it,
//! so a stage's rules are checked against the same lesson the others saw. A
//! change that only holds for a lesson a test built for itself is a change that
//! has not been tested.

use super::*;
use crate::generation_program::domain::{CompletionFailure, CompletionFailureKind};
use crate::lesson_planning::granular::tests::granular_record;
use crate::lesson_planning::granular::{LessonContentBlock, LessonStepRole};

use super::binding::*;
use super::inputs::*;

pub(super) fn transport_failure(message: impl Into<String>) -> CompletionFailure {
    CompletionFailure::new(CompletionFailureKind::Transport, vec![message.into()])
}
/// The knowledge stage as it is actually reached: the input the objectives
/// stage leaves behind, carrying the catalogue built for this lesson.
pub(super) fn knowledge_node_input(
    input: &GranularLessonProgramInput,
    objectives: &ObjectivePlan,
) -> Value {
    let outputs = BTreeMap::from([(
        "lessonObjectives".to_owned(),
        serde_json::to_value(objectives).expect("objective plan"),
    )]);
    build_knowledge_input(&input.to_value().expect("lesson input"), &outputs)
        .expect("knowledge node input")
}
pub(super) fn input_and_stage_outputs() -> (
    GranularLessonProgramInput,
    ObjectivePlan,
    BoundObjectivePlan,
    KnowledgePlan,
    AssessmentPlan,
    CoreStepPlan,
) {
    let record = granular_record();
    let input = GranularLessonProgramInput {
        topic: record.plan.topic.clone(),
        subtopic: record.plan.subtopic.clone(),
        teacher_source: None,
        lesson_duration_minutes: record
            .plan
            .steps
            .iter()
            .map(|step| step.duration_minutes)
            .sum(),
        curriculum_snapshot: record.curriculum_snapshot.clone(),
        source_evidence_snapshot: record.source_evidence_snapshot.clone(),
    };
    let objectives = ObjectivePlan {
        lesson_objectives: record
            .plan
            .lesson_objectives
            .iter()
            .map(|objective| GeneratedLessonObjective {
                statement: objective.statement.clone(),
                sequence: objective.sequence,
            })
            .collect(),
    };
    let bound_objectives =
        bind_generated_objectives(&input, &objectives).expect("bound lesson objectives");
    let knowledge = KnowledgePlan {
        objective_knowledge: record
            .plan
            .lesson_objectives
            .iter()
            .enumerate()
            .map(|(index, objective)| ObjectiveKnowledge {
                lesson_objective_id: format!("lesson-objective-{}", index + 1),
                knowledge_component_id: objective.knowledge_component_id.clone(),
            })
            .collect(),
        misconceptions: record.plan.misconceptions.clone(),
        prior_knowledge: record.plan.prior_knowledge.clone(),
        instructional_materials: record.plan.instructional_materials.clone(),
    };
    let objective_ids = record
        .plan
        .lesson_objectives
        .iter()
        .enumerate()
        .map(|(index, objective)| {
            (
                objective.id.as_str(),
                format!("lesson-objective-{}", index + 1),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let assessments = AssessmentPlan {
        assessments: record
            .plan
            .assessments
            .iter()
            .cloned()
            .map(|mut assessment| {
                assessment.lesson_objective_id = objective_ids
                    .get(assessment.lesson_objective_id.as_str())
                    .expect("assessment objective")
                    .clone();
                assessment
            })
            .collect(),
    };
    let core_steps = record
        .plan
        .steps
        .iter()
        .filter(|step| step.role == LessonStepRole::Core)
        .enumerate()
        .map(|(index, step)| {
            let explanations = step
                .blocks
                .iter()
                .filter_map(|block| match block {
                    LessonContentBlock::Explanation { content, .. } => Some(content.clone()),
                    _ => None,
                })
                .collect();
            let worked_examples = step
                .blocks
                .iter()
                .filter_map(|block| match block {
                    LessonContentBlock::WorkedExample {
                        problem,
                        steps,
                        final_answer,
                        ..
                    } => Some(GeneratedWorkedExample {
                        problem: problem.clone(),
                        steps: steps.clone(),
                        final_answer: final_answer.clone(),
                    }),
                    _ => None,
                })
                .collect();
            let practice_questions = step
                .blocks
                .iter()
                .filter_map(|block| match block {
                    LessonContentBlock::Practice {
                        question,
                        expected_answer,
                        hints,
                        ..
                    } => Some(GeneratedPractice {
                        question: question.clone(),
                        expected_answer: expected_answer.clone(),
                        hints: hints.clone(),
                    }),
                    _ => None,
                })
                .collect();
            let figure_sequences = step
                .blocks
                .iter()
                .filter_map(|block| match block {
                    LessonContentBlock::Visual {
                        source_record_id,
                        asset_file_name,
                        ..
                    } => {
                        let index = input
                            .source_evidence_snapshot
                            .figures
                            .iter()
                            .position(|figure| {
                                figure.source_record_id == *source_record_id
                                    && figure.asset_file_name == *asset_file_name
                            })
                            .expect("verified lesson figure");
                        Some(u16::try_from(index + 1).expect("figure sequence"))
                    }
                    _ => None,
                })
                .collect();
            GeneratedCoreStep {
                lesson_objective_sequence: u16::try_from(index + 1)
                    .expect("lesson objective sequence"),
                title: step.title.clone(),
                summary: step.summary.clone(),
                teacher_activities: step.teacher_activities.clone(),
                learner_activities: step.learner_activities.clone(),
                explanations,
                worked_examples,
                practice_questions,
                figure_sequences,
            }
        })
        .collect();
    (
        input,
        objectives,
        bound_objectives,
        knowledge,
        assessments,
        CoreStepPlan { core_steps },
    )
}
pub(super) fn split_core_plan(core: CoreStepPlan) -> (CoreInstructionPlan, CorePracticePlan) {
    let mut instruction_steps = Vec::new();
    let mut practice_steps = Vec::new();
    for step in core.core_steps {
        instruction_steps.push(GeneratedCoreInstructionStep {
            lesson_objective_sequence: step.lesson_objective_sequence,
            title: step.title,
            summary: step.summary,
            teacher_activities: step.teacher_activities,
            learner_activities: step.learner_activities,
            explanations: step.explanations,
            worked_examples: step.worked_examples,
            figure_sequences: step.figure_sequences,
        });
        practice_steps.push(GeneratedCorePracticeStep {
            lesson_objective_sequence: step.lesson_objective_sequence,
            practice_questions: step.practice_questions,
        });
    }
    (
        CoreInstructionPlan {
            core_steps: instruction_steps,
        },
        CorePracticePlan {
            core_steps: practice_steps,
        },
    )
}
