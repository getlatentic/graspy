//! What graspy's own checks found in a lesson's answers.
//!
//! A lesson carries worked examples, practice questions and assessments, each
//! with an answer a teacher will hand to a class. Some of those answers graspy
//! can verify; for the rest it has no checker. Both facts belong to the teacher
//! — one tells them where to look, and the other tells them how much of the
//! lesson nothing has looked at.
//!
//! This does not refuse a lesson. A wrong answer is refused while it is being
//! written, where there is a repair to spend; by the time a teacher is editing
//! one, blocking the save would stop them fixing it.

use serde::Serialize;

use crate::lesson_planning::answer_checking::{check_answer, AnswerCheck};

use super::model::{GranularLessonPlan, LessonContentBlock};

/// What the checks came to across a lesson's answers.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AnswerReport {
    /// Answers a checker read and agreed with.
    pub checked: usize,
    /// Answers no checker graspy has can read.
    pub unchecked: usize,
    /// What is wrong with the answers a checker disagreed with, in the words
    /// the checker that read them used.
    pub wrong: Vec<WrongAnswer>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WrongAnswer {
    pub question: String,
    pub problem: String,
}

/// Every question in the plan paired with the answer written for it.
fn questions_and_answers(plan: &GranularLessonPlan) -> Vec<(&str, &str)> {
    let assessments = plan
        .assessments
        .iter()
        .map(|item| (item.question.as_str(), item.expected_answer.as_str()));
    let in_steps = plan.steps.iter().flat_map(|step| {
        step.blocks.iter().filter_map(|block| match block {
            LessonContentBlock::WorkedExample {
                problem,
                final_answer,
                ..
            } => Some((problem.as_str(), final_answer.as_str())),
            LessonContentBlock::Practice {
                question,
                expected_answer,
                ..
            } => Some((question.as_str(), expected_answer.as_str())),
            _ => None,
        })
    });
    assessments.chain(in_steps).collect()
}

/// What graspy could and could not vouch for in this lesson.
pub fn answer_report(plan: &GranularLessonPlan) -> AnswerReport {
    let mut report = AnswerReport::default();
    for (question, answer) in questions_and_answers(plan) {
        match check_answer(question, answer) {
            AnswerCheck::Correct => report.checked += 1,
            AnswerCheck::Unchecked => report.unchecked += 1,
            AnswerCheck::Wrong(problem) => report.wrong.push(WrongAnswer {
                question: question.to_owned(),
                problem,
            }),
        }
    }
    report
}
