//! The quality gates an adapted teaching-group section must pass, and the
//! scrub that removes unsupported or learner-identifying wording when that is
//! the only failure — run by the backend so the judgement outlives the screen.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use regex::Regex;

use crate::classwork::domain::{
    ClassworkQualityReport, ClassworkValidationCheck, ClassworkValidationPass,
    GeneratedClassworkBlockInput,
};

use super::domain::DifferentiatedClassworkSectionJob;

const REQUIRED_KINDS: [&str; 4] = ["review", "worked_example", "practice", "solution"];

const UNSUPPORTED_CLAIM_PATTERN: &str = r"(?i)(?:solution|answer)s?\s+(?:[\w'-]+\s+){0,8}?(?:in|from)\s+the\s+(?:textbook|source)|(?:check|verify|compare)\s+(?:[\w'-]+\s+){0,8}?(?:against|with|in|using)\s+the\s+(?:textbook|source)|(?:drawn from|taken from|based on|mirrors?|echoe?s?)\s+the\s+textbook|textbook\s+(?:exercise|solution|answer|activity)|\b(?:you|your)\s+(?:chose|answered|got|missed)\b|\b(?:your|the)\s+(?:test|exit-test)\s+(?:answer|result)";

static UNSUPPORTED_CLAIM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(UNSUPPORTED_CLAIM_PATTERN).expect("claim pattern compiles"));
static IMAGE_MARKUP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)!\[[^\]]*\]\([^)]+\)|<img\b").expect("image pattern compiles")
});

/// An adapted section assembled from the model's per-block answers.
#[derive(Debug, Clone)]
pub(super) struct DifferentiatedCandidate {
    pub title: String,
    pub learning_goal_numbers: Vec<i64>,
    pub blocks: Vec<GeneratedClassworkBlockInput>,
}

/// Reads one adapted block, held to the shape the application has always
/// required of it.
pub(super) fn parse_block(
    completion: &str,
    base_kind: &str,
) -> Result<GeneratedClassworkBlockInput, String> {
    let Ok(block) = serde_json::from_str::<GeneratedClassworkBlockInput>(completion) else {
        return Err(format!("The {base_kind} response was not valid JSON."));
    };
    let goals_hold = (1..=12).contains(&block.learning_goal_numbers.len())
        && block.learning_goal_numbers.iter().all(|number| *number > 0);
    let text = block.text.trim();
    if REQUIRED_KINDS.contains(&block.kind.as_str())
        && !text.is_empty()
        && text.len() <= 8_000
        && goals_hold
        && block.source_material_keys.len() <= 12
    {
        Ok(block)
    } else {
        Err(format!(
            "The {base_kind} response did not match the required structure."
        ))
    }
}

pub(super) fn validate_candidate(
    candidate: &DifferentiatedCandidate,
    job: &DifferentiatedClassworkSectionJob,
    stage: &str,
) -> ClassworkValidationPass {
    let allowed_sources: BTreeSet<&str> = job
        .source_materials
        .iter()
        .map(|source| source.key.as_str())
        .collect();
    let checks = vec![
        check("content_structure", content_structure_findings(candidate)),
        check(
            "learning_goal_preservation",
            preservation_findings(candidate, job),
        ),
        check("block_alignment", block_alignment_findings(candidate, job)),
        check(
            "source_scope",
            source_scope_findings(candidate, &allowed_sources),
        ),
        check(
            "differentiation_presence",
            differentiation_findings(candidate, job),
        ),
        check("unsupported_claims", unsupported_claim_findings(candidate)),
    ];
    ClassworkValidationPass {
        stage: stage.to_owned(),
        passed: checks.iter().all(|check| check.passed),
        checks,
    }
}

pub(super) fn invalid_structure_pass(stage: &str, detail: String) -> ClassworkValidationPass {
    let mut checks = vec![ClassworkValidationCheck {
        check: "content_structure".to_owned(),
        passed: false,
        details: vec![detail],
    }];
    for name in [
        "learning_goal_preservation",
        "block_alignment",
        "source_scope",
        "differentiation_presence",
        "unsupported_claims",
    ] {
        checks.push(ClassworkValidationCheck {
            check: name.to_owned(),
            passed: true,
            details: Vec::new(),
        });
    }
    ClassworkValidationPass {
        stage: stage.to_owned(),
        passed: false,
        checks,
    }
}

pub(super) fn quality_report(
    outcome: &str,
    repair_attempted: bool,
    scrubbed_claim_count: i64,
    passes: Vec<ClassworkValidationPass>,
) -> ClassworkQualityReport {
    ClassworkQualityReport {
        outcome: outcome.to_owned(),
        repair_attempted,
        scrubbed_claim_count,
        passes,
    }
}

pub(super) fn failing_quality_details(pass: &ClassworkValidationPass) -> Vec<String> {
    pass.checks
        .iter()
        .filter(|check| !check.passed)
        .flat_map(|check| {
            check
                .details
                .iter()
                .map(move |detail| format!("{}: {detail}", check.check))
        })
        .collect()
}

pub(super) fn only_unsupported_claims_failed(pass: &ClassworkValidationPass) -> bool {
    let failures: Vec<&str> = pass
        .checks
        .iter()
        .filter(|check| !check.passed)
        .map(|check| check.check.as_str())
        .collect();
    failures == ["unsupported_claims"]
}

pub(super) struct ScrubbedCandidate {
    pub candidate: DifferentiatedCandidate,
    pub removed_claim_count: i64,
}

pub(super) fn scrub_unsupported_claims(candidate: &DifferentiatedCandidate) -> ScrubbedCandidate {
    let mut removed_claim_count = 0;
    let blocks = candidate
        .blocks
        .iter()
        .map(|block| {
            let text = block
                .text
                .split('\n')
                .map(|line| {
                    split_sentences(line)
                        .into_iter()
                        .filter(|sentence| {
                            let claimed = UNSUPPORTED_CLAIM.is_match(sentence);
                            if claimed {
                                removed_claim_count += 1;
                            }
                            !claimed
                        })
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_owned();
            GeneratedClassworkBlockInput {
                kind: block.kind.clone(),
                text,
                learning_goal_numbers: block.learning_goal_numbers.clone(),
                source_material_keys: block.source_material_keys.clone(),
            }
        })
        .collect();
    ScrubbedCandidate {
        candidate: DifferentiatedCandidate {
            title: candidate.title.clone(),
            learning_goal_numbers: candidate.learning_goal_numbers.clone(),
            blocks,
        },
        removed_claim_count,
    }
}

fn split_sentences(line: &str) -> Vec<&str> {
    let mut sentences = Vec::new();
    let mut start = 0;
    let mut boundary = false;
    for (index, character) in line.char_indices() {
        if boundary && character.is_whitespace() {
            sentences.push(&line[start..index]);
            start = index + character.len_utf8();
            boundary = false;
            continue;
        }
        boundary = matches!(character, '.' | '!' | '?');
        if character.is_whitespace() && start == index {
            start = index + character.len_utf8();
        }
    }
    if start < line.len() {
        sentences.push(&line[start..]);
    }
    sentences
}

fn check(name: &str, details: Vec<String>) -> ClassworkValidationCheck {
    ClassworkValidationCheck {
        check: name.to_owned(),
        passed: details.is_empty(),
        details,
    }
}

fn content_structure_findings(candidate: &DifferentiatedCandidate) -> Vec<String> {
    let mut findings = Vec::new();
    if candidate.title.trim().is_empty() || candidate.title.len() > 160 {
        findings.push("Use a clear title no longer than 160 characters.".to_owned());
    }
    let kind_count = |kind: &str| {
        candidate
            .blocks
            .iter()
            .filter(|block| block.kind == kind)
            .count()
    };
    if candidate.blocks.len() != REQUIRED_KINDS.len()
        || REQUIRED_KINDS.iter().any(|kind| kind_count(kind) != 1)
    {
        findings.push(
            "Keep exactly one review, worked example, practice task and solution.".to_owned(),
        );
    }
    for block in &candidate.blocks {
        if block.text.trim().is_empty() || block.text.len() > 8_000 {
            findings.push(format!(
                "{} must contain usable text no longer than 8,000 characters.",
                block.kind
            ));
        }
        if IMAGE_MARKUP.is_match(&block.text) {
            findings.push(format!("{} must not add an image.", block.kind));
        }
    }
    findings
}

fn preservation_findings(
    candidate: &DifferentiatedCandidate,
    job: &DifferentiatedClassworkSectionJob,
) -> Vec<String> {
    let expected = canonical_numbers(&job.base_section.learning_goal_numbers);
    let actual = canonical_numbers(&candidate.learning_goal_numbers);
    if actual == expected {
        Vec::new()
    } else {
        vec![format!(
            "Keep the original section learning goals exactly: {}.",
            expected
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        )]
    }
}

fn block_alignment_findings(
    candidate: &DifferentiatedCandidate,
    job: &DifferentiatedClassworkSectionJob,
) -> Vec<String> {
    let mut findings = Vec::new();
    for block in &candidate.blocks {
        let Some(base) = job
            .base_section
            .blocks
            .iter()
            .find(|base| base.kind == block.kind)
        else {
            continue;
        };
        if canonical_numbers(&block.learning_goal_numbers)
            != canonical_numbers(&base.learning_goal_numbers)
        {
            findings.push(format!(
                "Keep the {} block connected to its original learning goals.",
                block.kind
            ));
        }
    }
    findings
}

fn source_scope_findings(
    candidate: &DifferentiatedCandidate,
    allowed_sources: &BTreeSet<&str>,
) -> Vec<String> {
    let mut findings = Vec::new();
    for block in &candidate.blocks {
        let unique: BTreeSet<&str> = block
            .source_material_keys
            .iter()
            .map(String::as_str)
            .collect();
        if unique.len() != block.source_material_keys.len() {
            findings.push(format!("List each {} source once.", block.kind));
        }
        let unavailable: Vec<&str> = unique
            .iter()
            .filter(|key| !allowed_sources.contains(**key))
            .copied()
            .collect();
        if !unavailable.is_empty() {
            findings.push(format!(
                "Remove sources outside this original section: {}.",
                unavailable.join(", ")
            ));
        }
    }
    findings
}

fn differentiation_findings(
    candidate: &DifferentiatedCandidate,
    job: &DifferentiatedClassworkSectionJob,
) -> Vec<String> {
    let changed = candidate.blocks.iter().any(|block| {
        job.base_section
            .blocks
            .iter()
            .find(|base| base.kind == block.kind)
            .is_none_or(|base| block.text.trim() != base.text.trim())
    });
    if changed {
        Vec::new()
    } else {
        vec!["Adapt at least one classwork block to the supplied group results.".to_owned()]
    }
}

fn unsupported_claim_findings(candidate: &DifferentiatedCandidate) -> Vec<String> {
    let mut findings = Vec::new();
    for block in &candidate.blocks {
        let matches: Vec<String> = UNSUPPORTED_CLAIM
            .find_iter(&block.text)
            .map(|found| format!("“{}”", found.as_str()))
            .collect();
        if !matches.is_empty() {
            findings.push(format!(
                "{} contains unsupported or learner-identifying wording: {}.",
                block.kind,
                matches.join(", ")
            ));
        }
    }
    findings
}

fn canonical_numbers(values: &[i64]) -> Vec<i64> {
    let set: BTreeSet<i64> = values.iter().copied().collect();
    set.into_iter().collect()
}
