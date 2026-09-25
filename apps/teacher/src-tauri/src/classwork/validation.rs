//! The quality gates a generated classwork section must pass before it is kept,
//! and the scrub that removes unsupported source wording when that is the only
//! failure. The backend runs these so a section is judged the same way whether
//! or not the screen that asked for it is still open.

use std::collections::BTreeSet;
use std::sync::LazyLock;

use regex::Regex;
use serde::Deserialize;

use crate::lesson_planning::granular::LessonContentBlock;

use super::domain::{
    ClassworkQualityReport, ClassworkSectionJob, ClassworkValidationCheck, ClassworkValidationPass,
    GeneratedClassworkBlockInput,
};

const REQUIRED_KINDS: [&str; 4] = ["review", "worked_example", "practice", "solution"];

const SOURCE_CLAIM_PATTERN: &str = r"(?i)(?:solution|answer)s?\s+(?:[\w'-]+\s+){0,8}?(?:in|from)\s+the\s+(?:textbook|source)|(?:check|verify|compare)\s+(?:[\w'-]+\s+){0,8}?(?:against|with|in|using)\s+the\s+(?:textbook|source)|(?:drawn from|taken from|based on|mirrors?|echoe?s?)\s+the\s+textbook|textbook\s+(?:exercise|solution|answer|activity)";

static SOURCE_CLAIM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(SOURCE_CLAIM_PATTERN).expect("source-claim pattern compiles"));
static IMAGE_MARKUP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)!\[[^\]]*\]\([^)]+\)|<img\b").expect("image pattern compiles")
});
static FRACTION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"-?\d+\s*/\s*\d+").expect("fraction pattern compiles"));
static LATEX_FRACTION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\\frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(\d+)\s*\}").expect("latex fraction compiles")
});
static WHITESPACE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\s+").expect("whitespace pattern compiles"));

/// A section as the model returned it, before any quality verdict.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct ClassworkCandidate {
    pub title: String,
    pub learning_goal_numbers: Vec<i64>,
    pub blocks: Vec<GeneratedClassworkBlockInput>,
}

/// Reads a completion into a candidate, holding it to the same shape the
/// application has always required: one title, positive goal numbers, and four
/// bounded blocks of known kinds.
pub(super) fn parse_candidate(completion: &str) -> Result<ClassworkCandidate, String> {
    let Ok(candidate) = serde_json::from_str::<ClassworkCandidate>(completion) else {
        return Err("Return one readable JSON section matching the required structure.".to_owned());
    };
    let bounds_hold = {
        let title = candidate.title.trim();
        let goals_hold = |goals: &[i64]| {
            (1..=12).contains(&goals.len()) && goals.iter().all(|number| *number > 0)
        };
        !title.is_empty()
            && title.len() <= 160
            && goals_hold(&candidate.learning_goal_numbers)
            && candidate.blocks.len() == 4
            && candidate.blocks.iter().all(|block| {
                let text = block.text.trim();
                REQUIRED_KINDS.contains(&block.kind.as_str())
                    && !text.is_empty()
                    && text.len() <= 8_000
                    && goals_hold(&block.learning_goal_numbers)
                    && block.source_material_keys.len() <= 3
            })
    };
    if bounds_hold {
        Ok(candidate)
    } else {
        Err(
            "Return a complete title, learning-goal list, and four fully linked material blocks."
                .to_owned(),
        )
    }
}

pub(super) fn validate_candidate(
    candidate: &ClassworkCandidate,
    job: &ClassworkSectionJob,
    stage: &str,
) -> ClassworkValidationPass {
    let allowed_goals: BTreeSet<i64> = (1..=job.lesson.learning_goals.len() as i64).collect();
    let allowed_sources: BTreeSet<&str> = job
        .source_materials
        .iter()
        .map(|source| source.key.as_str())
        .collect();
    let section_goals: BTreeSet<i64> = candidate.learning_goal_numbers.iter().copied().collect();
    let block_goals: BTreeSet<i64> = candidate
        .blocks
        .iter()
        .flat_map(|block| block.learning_goal_numbers.iter().copied())
        .collect();

    let checks = vec![
        check(
            "content_structure",
            content_structure_findings(candidate, job),
        ),
        check(
            "learning_goal_alignment",
            learning_goal_alignment_findings(candidate, &section_goals, &block_goals),
        ),
        check(
            "scope_compliance",
            scope_findings(candidate, &allowed_goals, job),
        ),
        check(
            "source_presence",
            source_presence_findings(candidate, !allowed_sources.is_empty()),
        ),
        check(
            "source_validity",
            source_validity_findings(candidate, &allowed_sources),
        ),
        check(
            "unsupported_source_claims",
            unsupported_source_claim_findings(candidate),
        ),
    ];
    ClassworkValidationPass {
        stage: stage.to_owned(),
        passed: checks.iter().all(|check| check.passed),
        checks,
    }
}

/// The pass recorded when the completion never parsed into a candidate.
pub(super) fn invalid_structure_pass(stage: &str, detail: String) -> ClassworkValidationPass {
    let mut checks = vec![ClassworkValidationCheck {
        check: "content_structure".to_owned(),
        passed: false,
        details: vec![detail],
    }];
    for name in [
        "learning_goal_alignment",
        "scope_compliance",
        "source_presence",
        "source_validity",
        "unsupported_source_claims",
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

pub(super) fn only_unsupported_source_claims_failed(pass: &ClassworkValidationPass) -> bool {
    let failures: Vec<&str> = pass
        .checks
        .iter()
        .filter(|check| !check.passed)
        .map(|check| check.check.as_str())
        .collect();
    failures == ["unsupported_source_claims"]
}

pub(super) struct ScrubbedCandidate {
    pub candidate: ClassworkCandidate,
    pub removed_claim_count: i64,
}

pub(super) fn scrub_unsupported_source_claims(candidate: &ClassworkCandidate) -> ScrubbedCandidate {
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
                            let claimed = SOURCE_CLAIM.is_match(sentence);
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
        candidate: ClassworkCandidate {
            title: candidate.title.clone(),
            learning_goal_numbers: candidate.learning_goal_numbers.clone(),
            blocks,
        },
        removed_claim_count,
    }
}

/// Splits a line into sentences at whitespace that follows ., ! or ? —
/// the boundary stays with the sentence before it.
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

fn content_structure_findings(
    candidate: &ClassworkCandidate,
    job: &ClassworkSectionJob,
) -> Vec<String> {
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
            "Include exactly one review, worked example, practice task, and solution.".to_owned(),
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
            findings.push(format!(
                "{} must not contain an image. Lesson figures are attached from confirmed source material.",
                block.kind
            ));
        }
    }
    if let Some(regeneration) = &job.regeneration {
        let previous = &regeneration.previous_section;
        let title_changed = normalize_text(&candidate.title) != normalize_text(&previous.title);
        let block_changed = candidate.blocks.iter().any(|block| {
            previous
                .blocks
                .iter()
                .find(|previous_block| previous_block.kind == block.kind)
                .is_none_or(|previous_block| {
                    normalize_text(&block.text) != normalize_text(&previous_block.text)
                })
        });
        if !title_changed && !block_changed {
            findings.push(
                "Replace the current section with materially different wording or activities."
                    .to_owned(),
            );
        }
    }
    findings
}

fn normalize_text(value: &str) -> String {
    WHITESPACE.replace_all(value.trim(), " ").to_lowercase()
}

fn learning_goal_alignment_findings(
    candidate: &ClassworkCandidate,
    section_goals: &BTreeSet<i64>,
    block_goals: &BTreeSet<i64>,
) -> Vec<String> {
    let mut findings = Vec::new();
    if candidate.learning_goal_numbers.is_empty() {
        findings.push("Connect the section to at least one learning goal.".to_owned());
    }
    if section_goals.len() != candidate.learning_goal_numbers.len() {
        findings.push("List each section learning goal once.".to_owned());
    }
    for block in &candidate.blocks {
        if block.learning_goal_numbers.is_empty() {
            findings.push(format!(
                "Connect the {} block to at least one section learning goal.",
                block.kind
            ));
        }
        let unique: BTreeSet<i64> = block.learning_goal_numbers.iter().copied().collect();
        if unique.len() != block.learning_goal_numbers.len() {
            findings.push(format!("List each {} learning goal once.", block.kind));
        }
    }
    let missing: Vec<String> = section_goals
        .difference(block_goals)
        .map(ToString::to_string)
        .collect();
    let extra: Vec<String> = block_goals
        .difference(section_goals)
        .map(ToString::to_string)
        .collect();
    if !missing.is_empty() {
        findings.push(format!(
            "Use section learning goals {} in at least one material block.",
            missing.join(", ")
        ));
    }
    if !extra.is_empty() {
        findings.push(format!(
            "Remove undeclared block learning goals {}.",
            extra.join(", ")
        ));
    }
    findings
}

fn scope_findings(
    candidate: &ClassworkCandidate,
    allowed_goals: &BTreeSet<i64>,
    job: &ClassworkSectionJob,
) -> Vec<String> {
    let used: BTreeSet<i64> = candidate
        .learning_goal_numbers
        .iter()
        .chain(
            candidate
                .blocks
                .iter()
                .flat_map(|block| block.learning_goal_numbers.iter()),
        )
        .copied()
        .collect();
    let invalid: Vec<String> = used
        .difference(allowed_goals)
        .map(ToString::to_string)
        .collect();
    let mut findings = if invalid.is_empty() {
        Vec::new()
    } else {
        vec![format!(
            "Use only the confirmed lesson goals; remove goal numbers {}.",
            invalid.join(", ")
        )]
    };
    findings.extend(fraction_ordering_plan_findings(candidate, job));
    findings
}

fn source_presence_findings(
    candidate: &ClassworkCandidate,
    sources_available: bool,
) -> Vec<String> {
    if !sources_available {
        return Vec::new();
    }
    candidate
        .blocks
        .iter()
        .filter(|block| block.source_material_keys.is_empty())
        .map(|block| {
            format!(
                "Connect the {} block to at least one supplied source.",
                block.kind
            )
        })
        .collect()
}

fn source_validity_findings(
    candidate: &ClassworkCandidate,
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
        let invalid: Vec<&str> = unique
            .iter()
            .filter(|key| !allowed_sources.contains(**key))
            .copied()
            .collect();
        if !invalid.is_empty() {
            findings.push(format!(
                "Remove unavailable {} source keys: {}.",
                block.kind,
                invalid.join(", ")
            ));
        }
    }
    findings
}

fn unsupported_source_claim_findings(candidate: &ClassworkCandidate) -> Vec<String> {
    let mut findings = Vec::new();
    for block in &candidate.blocks {
        let matches: Vec<String> = SOURCE_CLAIM
            .find_iter(&block.text)
            .map(|found| format!("“{}”", found.as_str()))
            .collect();
        if !matches.is_empty() {
            findings.push(format!(
                "{} contains unsupported source wording: {}.",
                block.kind,
                matches.join(", ")
            ));
        }
    }
    findings
}

struct PlannedOrderingTask {
    direction: &'static str,
    operands: Vec<String>,
    answer: String,
}

/// Mathematics lessons that plan an exact fraction-ordering task must keep it:
/// the worked example and practice may not swap in a different problem, and the
/// answers must match the plan's.
fn fraction_ordering_plan_findings(
    candidate: &ClassworkCandidate,
    job: &ClassworkSectionJob,
) -> Vec<String> {
    if job.lesson.subject.to_lowercase() != "mathematics" {
        return Vec::new();
    }
    let Some(plan_step) = &job.step.plan_step else {
        return Vec::new();
    };
    let block_text = |kind: &str| {
        candidate
            .blocks
            .iter()
            .find(|block| block.kind == kind)
            .map_or("", |block| block.text.as_str())
    };

    let mut findings = Vec::new();
    for block in &plan_step.blocks {
        match block {
            LessonContentBlock::WorkedExample {
                problem,
                final_answer,
                ..
            } => {
                if let Some(task) = ordering_task(problem, final_answer) {
                    let material = block_text("worked_example");
                    if !preserves_task(material, &task) {
                        findings.push("The worked example must preserve the exact fraction-ordering task from the confirmed lesson plan.".to_owned());
                    }
                    if !contains_answer(material, &task.answer) {
                        findings.push("The worked example must give the correct ordered answer from the confirmed lesson plan.".to_owned());
                    }
                }
            }
            LessonContentBlock::Practice {
                question,
                expected_answer,
                ..
            } => {
                if let Some(task) = ordering_task(question, expected_answer) {
                    if !preserves_task(block_text("practice"), &task) {
                        findings.push("The practice block must preserve the exact fraction-ordering task from the confirmed lesson plan.".to_owned());
                    }
                    if !contains_answer(block_text("solution"), &task.answer) {
                        findings.push("The solution must give the correct ordered answer for the planned practice task.".to_owned());
                    }
                }
            }
            _ => {}
        }
    }
    findings
}

fn ordering_task(question: &str, answer: &str) -> Option<PlannedOrderingTask> {
    let normalized_question = normalize_math(question);
    let direction = if normalized_question.contains("ascending") {
        "ascending"
    } else if normalized_question.contains("descending") {
        "descending"
    } else {
        return None;
    };
    let operands = fractions(&normalized_question);
    let normalized_answer = normalize_math(answer);
    if operands.len() < 2 || (!normalized_answer.contains('<') && !normalized_answer.contains('>'))
    {
        return None;
    }
    Some(PlannedOrderingTask {
        direction,
        operands,
        answer: answer.to_owned(),
    })
}

fn preserves_task(text: &str, task: &PlannedOrderingTask) -> bool {
    let normalized = normalize_math(text);
    let present = fractions(&normalized);
    normalized.contains(task.direction)
        && task
            .operands
            .iter()
            .all(|operand| present.contains(operand))
}

fn contains_answer(text: &str, answer: &str) -> bool {
    let expected = normalize_math(answer).replace(' ', "");
    if !expected.contains('<') && !expected.contains('>') {
        return false;
    }
    normalize_math(text).replace(' ', "").contains(&expected)
}

fn fractions(text: &str) -> Vec<String> {
    let mut seen = Vec::new();
    for found in FRACTION.find_iter(text) {
        let value = found.as_str().replace(' ', "");
        if !seen.contains(&value) {
            seen.push(value);
        }
    }
    seen
}

fn normalize_math(value: &str) -> String {
    let without_latex = LATEX_FRACTION.replace_all(value, "$1/$2");
    WHITESPACE
        .replace_all(without_latex.trim(), " ")
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classwork::domain::{
        ClassworkSectionJob, ClassworkSource, ClassworkStepContext, ConfirmedLessonContext,
    };

    fn job() -> ClassworkSectionJob {
        ClassworkSectionJob {
            run_id: "run-1".to_owned(),
            section_id: "section-1".to_owned(),
            generation_token: "token-1".to_owned(),
            lesson: ConfirmedLessonContext {
                lesson_id: "lesson-1".to_owned(),
                lesson_version_id: "version-1".to_owned(),
                lesson_version_number: 1,
                subject: "Mathematics".to_owned(),
                grade: "JSS 2".to_owned(),
                topic: "Fractions".to_owned(),
                subtopic: None,
                learning_goals: vec![
                    "Compare fractions.".to_owned(),
                    "Order fractions.".to_owned(),
                ],
            },
            step: ClassworkStepContext {
                sequence: 1,
                title: "Compare".to_owned(),
                teacher_activity: "Model comparing.".to_owned(),
                learner_activity: "Compare pairs.".to_owned(),
                duration_minutes: Some(10),
                plan_step: None,
            },
            source_materials: vec![ClassworkSource {
                key: "source-1".to_owned(),
                title: "Fractions".to_owned(),
                text: "Fractions compare parts.".to_owned(),
                publisher: "Siyavula".to_owned(),
                source_url: "https://example.org".to_owned(),
                licence_name: "CC BY".to_owned(),
                licence_url: "https://example.org/licence".to_owned(),
                attribution: "Siyavula".to_owned(),
            }],
            regeneration: None,
        }
    }

    fn candidate(text: &str) -> ClassworkCandidate {
        let block = |kind: &str| GeneratedClassworkBlockInput {
            kind: kind.to_owned(),
            text: text.to_owned(),
            learning_goal_numbers: vec![1],
            source_material_keys: vec!["source-1".to_owned()],
        };
        ClassworkCandidate {
            title: "Comparing fractions".to_owned(),
            learning_goal_numbers: vec![1],
            blocks: vec![
                block("review"),
                block("worked_example"),
                block("practice"),
                block("solution"),
            ],
        }
    }

    #[test]
    fn a_complete_grounded_section_passes_every_check() {
        let pass = validate_candidate(&candidate("Compare 1/2 and 2/4."), &job(), "initial");
        assert!(pass.passed, "{:?}", pass.checks);
    }

    #[test]
    fn goal_numbers_outside_the_lesson_fail_scope() {
        let mut invalid = candidate("Compare 1/2 and 2/4.");
        invalid.learning_goal_numbers = vec![1, 7];
        invalid.blocks[0].learning_goal_numbers = vec![7];
        let pass = validate_candidate(&invalid, &job(), "initial");
        let scope = pass
            .checks
            .iter()
            .find(|check| check.check == "scope_compliance")
            .unwrap();
        assert!(!scope.passed);
        assert!(scope.details[0].contains('7'));
    }

    #[test]
    fn textbook_claims_are_found_and_scrubbed() {
        let claiming = candidate(
            "Work through the steps. Check your answer against the textbook. Then move on.",
        );
        let pass = validate_candidate(&claiming, &job(), "initial");
        assert!(
            only_unsupported_source_claims_failed(&pass),
            "{:?}",
            pass.checks
        );

        let scrubbed = scrub_unsupported_source_claims(&claiming);
        assert_eq!(scrubbed.removed_claim_count, 4);
        assert!(!scrubbed.candidate.blocks[0].text.contains("textbook"));
        assert!(scrubbed.candidate.blocks[0]
            .text
            .contains("Work through the steps."));
        assert!(scrubbed.candidate.blocks[0].text.contains("Then move on."));
        assert!(validate_candidate(&scrubbed.candidate, &job(), "scrub").passed);
    }

    #[test]
    fn a_completion_that_is_not_a_section_reads_as_a_structure_failure() {
        assert!(parse_candidate("not json").is_err());
        assert!(parse_candidate(r#"{"title":"x","learningGoalNumbers":[1],"blocks":[]}"#).is_err());
        let pass = invalid_structure_pass("initial", "detail".to_owned());
        assert!(!pass.passed);
        assert_eq!(pass.checks[0].check, "content_structure");
    }

    #[test]
    fn a_planned_ordering_task_must_be_preserved_with_its_answer() {
        use crate::lesson_planning::granular::{
            LessonContentBlock, LessonPlanStep, LessonStepRole,
        };
        let mut ordering_job = job();
        ordering_job.step.plan_step = Some(LessonPlanStep {
            id: "step-1".to_owned(),
            sequence: 1,
            role: LessonStepRole::Core,
            title: "Order".to_owned(),
            summary: "Order fractions.".to_owned(),
            duration_minutes: 10,
            lesson_objective_id: None,
            knowledge_type: None,
            teacher_activities: Vec::new(),
            learner_activities: Vec::new(),
            blocks: vec![LessonContentBlock::Practice {
                id: "block-1".to_owned(),
                lesson_objective_id: "objective-1".to_owned(),
                question: "Arrange 1/2, 3/5 and 2/3 in ascending order.".to_owned(),
                expected_answer: "1/2 < 3/5 < 2/3".to_owned(),
                hints: Vec::new(),
            }],
        });
        let wrong = candidate("Arrange 1/4 and 1/8.");
        let pass = validate_candidate(&wrong, &ordering_job, "initial");
        let scope = pass
            .checks
            .iter()
            .find(|check| check.check == "scope_compliance")
            .unwrap();
        assert!(!scope.passed);

        let mut right = candidate("Arrange 1/2, 3/5 and 2/3 in ascending order.");
        right.blocks[3].text = "The order is 1/2 < 3/5 < 2/3.".to_owned();
        assert!(validate_candidate(&right, &ordering_job, "initial").passed);
    }
}
