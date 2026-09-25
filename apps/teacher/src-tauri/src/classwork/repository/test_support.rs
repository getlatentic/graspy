//! The lesson, run and sections a classwork-repository test works on.
//!
//! Building a run means a confirmed lesson behind it and a section per part, so
//! every test here would otherwise open with the same thirty lines before
//! reaching the one thing it is checking.

use crate::classwork::repository::*;
use crate::{content_corpus::ContentCorpus, db::Database, lesson_planning::LessonContextRequest};

pub(super) fn generated(title: &str) -> GeneratedClassworkSectionInput {
    GeneratedClassworkSectionInput {
        title: title.to_owned(),
        learning_goal_numbers: vec![1],
        blocks: ["review", "worked_example", "practice", "solution"]
            .into_iter()
            .map(|kind| GeneratedClassworkBlockInput {
                kind: kind.to_owned(),
                text: format!("{kind} content"),
                learning_goal_numbers: vec![1],
                source_material_keys: vec!["ch04-b016".to_owned()],
            })
            .collect(),
        quality: passing_quality(),
    }
}
pub(super) fn passing_quality() -> ClassworkQualityReport {
    ClassworkQualityReport {
        outcome: "passed".to_owned(),
        repair_attempted: false,
        scrubbed_claim_count: 0,
        passes: vec![ClassworkValidationPass {
            stage: "initial".to_owned(),
            passed: true,
            checks: [
                "content_structure",
                "learning_goal_alignment",
                "scope_compliance",
                "source_presence",
                "source_validity",
                "unsupported_source_claims",
            ]
            .into_iter()
            .map(|check| ClassworkValidationCheck {
                check: check.to_owned(),
                passed: true,
                details: vec![],
            })
            .collect(),
        }],
    }
}
pub(super) fn failed_quality() -> ClassworkQualityReport {
    let mut quality = passing_quality();
    quality.outcome = "failed".to_owned();
    quality.repair_attempted = true;
    quality.passes[0].passed = false;
    let claim_check = quality.passes[0]
        .checks
        .iter_mut()
        .find(|check| check.check == "unsupported_source_claims")
        .expect("claim check");
    claim_check.passed = false;
    claim_check.details = vec!["Remove unsupported source wording.".to_owned()];
    quality
}
pub(super) fn complete_classwork(
    database: &Database,
    corpus: &ContentCorpus,
    context: &LessonContextRequest,
) -> ClassworkWorkspaceSnapshot {
    let mut workspace = start_run(
        database,
        corpus,
        StartClassworkRunRequest {
            context: context.clone(),
            lesson_id: "lesson".to_owned(),
        },
    )
    .expect("run");
    loop {
        let run = workspace.run.as_ref().expect("run");
        if run.status == "complete" {
            return workspace;
        }
        let started = begin_section(
            database,
            BeginClassworkSectionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: None,
            },
        )
        .expect("section");
        workspace = complete_section(
            database,
            CompleteClassworkSectionRequest {
                context: context.clone(),
                run_id: started.job.run_id,
                section_id: started.job.section_id,
                generation_token: started.job.generation_token,
                section: generated("Comparing fraction models"),
            },
        )
        .expect("completed section");
    }
}
