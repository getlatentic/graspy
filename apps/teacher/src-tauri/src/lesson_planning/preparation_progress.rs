//! What a teacher is watching while a lesson is prepared.
//!
//! The program runs eleven nodes, several of which are assembly a teacher has
//! no reason to read — completing reviewed practice and validating the finished
//! plan are the same moment of work as the drafting that precedes them. They
//! collapse into seven steps, each contiguous so the sequence still reads in
//! the order it happens.
//!
//! Node ids stay on this side of the boundary. The step name that crosses it is
//! a stable contract, so renaming a node never changes what a teacher is told,
//! and the wording itself belongs to the interface.

use serde::Serialize;

use crate::generation_program::repository::NodeProgress;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum PreparationStep {
    LearningGoals,
    PriorKnowledge,
    Checks,
    SourceMaterial,
    TeachingSequence,
    Practice,
    PuttingTogether,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum PreparationStepState {
    Pending,
    Running,
    Done,
    Failed,
    Stopped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreparationStepProgress {
    pub step: PreparationStep,
    pub state: PreparationStepState,
}

/// Every step, in the order the work happens.
///
/// A teacher reads this list top to bottom and takes it for a sequence, so it
/// has to be one. `the_steps_a_teacher_reads_are_in_the_order_the_program_runs`
/// derives the order from the program rather than trusting this list, because
/// the two drifting apart is exactly what showed a later step finished while an
/// earlier one had not started.
const STEPS: [PreparationStep; 7] = [
    PreparationStep::SourceMaterial,
    PreparationStep::LearningGoals,
    PreparationStep::PriorKnowledge,
    PreparationStep::Checks,
    PreparationStep::TeachingSequence,
    PreparationStep::Practice,
    PreparationStep::PuttingTogether,
];

fn step_for_node(node_id: &str) -> Option<PreparationStep> {
    match node_id {
        "objective-decomposition" => Some(PreparationStep::LearningGoals),
        "knowledge-planning" => Some(PreparationStep::PriorKnowledge),
        "assessment-design" | "complete-reviewed-assessments" => Some(PreparationStep::Checks),
        "evidence-planning" => Some(PreparationStep::SourceMaterial),
        "core-step-drafting" => Some(PreparationStep::TeachingSequence),
        "core-practice-drafting" | "complete-reviewed-practice" => Some(PreparationStep::Practice),
        "assemble-core-steps" | "assemble-lesson" | "validate-complete-plan" => {
            Some(PreparationStep::PuttingTogether)
        }
        _ => None,
    }
}

/// A step is only finished when everything inside it is.
///
/// Reporting a step as running the moment any part of it starts is what makes
/// the sequence honest: a teacher sees the step they are waiting on, not the
/// node the executor happens to be inside.
fn state_for(nodes: &[&str]) -> PreparationStepState {
    if nodes.is_empty() {
        return PreparationStepState::Pending;
    }
    if nodes.contains(&"failed") {
        return PreparationStepState::Failed;
    }
    if nodes.contains(&"cancelled") {
        return PreparationStepState::Stopped;
    }
    if nodes
        .iter()
        .any(|status| *status == "running" || *status == "interrupted")
    {
        return PreparationStepState::Running;
    }
    if nodes.iter().all(|status| *status == "completed") {
        return PreparationStepState::Done;
    }
    PreparationStepState::Pending
}

pub fn summarise(nodes: &[NodeProgress]) -> Vec<PreparationStepProgress> {
    if nodes.is_empty() {
        return Vec::new();
    }
    STEPS
        .iter()
        .map(|step| {
            let statuses = nodes
                .iter()
                .filter(|node| step_for_node(&node.node_id) == Some(*step))
                .map(|node| node.status.as_str())
                .collect::<Vec<_>>();
            PreparationStepProgress {
                step: *step,
                state: state_for(&statuses),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The list is a promise about sequence. Deriving the same order from the
    /// program is the only way to keep that promise true when a node moves.
    #[test]
    fn the_steps_a_teacher_reads_are_in_the_order_the_program_runs() {
        let program = crate::lesson_planning::program::granular_lesson_program().expect("program");
        let mut as_run: Vec<PreparationStep> = Vec::new();
        for node in program.ordered_nodes() {
            if let Some(step) = step_for_node(&node.id) {
                if !as_run.contains(&step) {
                    as_run.push(step);
                }
            }
        }
        assert_eq!(
            as_run,
            STEPS.to_vec(),
            "the steps shown to a teacher are not the order the work happens in",
        );
    }

    /// Every node has to land on a step, or a teacher waits on a list that has
    /// stopped moving while the engine is still working.
    #[test]
    fn every_node_in_the_program_belongs_to_a_step() {
        let program = crate::lesson_planning::program::granular_lesson_program().expect("program");
        for node in program.ordered_nodes() {
            assert!(
                step_for_node(&node.id).is_some(),
                "{} is not shown to the teacher on any step",
                node.id,
            );
        }
    }

    fn node(node_id: &str, status: &str) -> NodeProgress {
        NodeProgress {
            node_id: node_id.to_owned(),
            status: status.to_owned(),
        }
    }

    #[test]
    fn reports_the_whole_sequence_from_the_first_moment() {
        // evidence-planning is the program's first node, so the first step is
        // the one a teacher sees running.
        let progress = summarise(&[
            node("evidence-planning", "running"),
            node("objective-decomposition", "pending"),
            node("knowledge-planning", "pending"),
        ]);

        assert_eq!(progress.len(), STEPS.len());
        assert_eq!(progress[0].step, PreparationStep::SourceMaterial);
        assert_eq!(progress[0].state, PreparationStepState::Running);
        assert!(progress[1..]
            .iter()
            .all(|entry| entry.state == PreparationStepState::Pending));
    }

    #[test]
    fn a_step_is_finished_only_when_all_of_its_work_is() {
        let progress = summarise(&[
            node("assessment-design", "completed"),
            node("complete-reviewed-assessments", "running"),
        ]);
        let checks = progress
            .iter()
            .find(|entry| entry.step == PreparationStep::Checks)
            .expect("the checks step");

        assert_eq!(checks.state, PreparationStepState::Running);
    }

    #[test]
    fn a_failure_inside_a_step_is_the_state_of_that_step() {
        let progress = summarise(&[
            node("core-practice-drafting", "completed"),
            node("complete-reviewed-practice", "failed"),
        ]);
        let practice = progress
            .iter()
            .find(|entry| entry.step == PreparationStep::Practice)
            .expect("the practice step");

        assert_eq!(practice.state, PreparationStepState::Failed);
    }

    #[test]
    fn stopping_reads_as_stopped_rather_than_failed() {
        let progress = summarise(&[node("evidence-planning", "cancelled")]);
        let sources = progress
            .iter()
            .find(|entry| entry.step == PreparationStep::SourceMaterial)
            .expect("the source material step");

        assert_eq!(sources.state, PreparationStepState::Stopped);
    }

    #[test]
    fn a_run_that_never_started_has_no_sequence_to_show() {
        assert_eq!(summarise(&[]), Vec::new());
    }

    #[test]
    fn the_step_name_crossing_the_boundary_is_stable() {
        let encoded =
            serde_json::to_string(&PreparationStep::TeachingSequence).expect("serialisable step");

        assert_eq!(encoded, "\"teaching-sequence\"");
    }
}
