//! Whether an answer graspy wrote for a question follows from it.
//!
//! Each topic brings its own checker — `mathematics` reads fractions, and
//! `place_value` reads how large numbers are written and named — and this is
//! where a question is offered to each in turn. A question none of them reads
//! comes back unchecked, which is a different fact from an answer that was read
//! and agreed with, and the two stay apart because a teacher handed the second
//! one is owed the difference.

use super::{
    comparing::check_quantity_order, counting::check_counting_sequence, mathematics::check_fraction_answer,
    place_value::{check_number_name, check_stated_quantity},
};

pub use super::mathematics::AnswerCheck;

/// The checkers a question is offered to. The first that reads it answers for
/// it, so adding a topic is adding a line here.
const CHECKERS: [fn(&str, &str) -> AnswerCheck; 5] = [
    check_fraction_answer,
    check_quantity_order,
    check_counting_sequence,
    check_stated_quantity,
    check_number_name,
];

/// What checking this answer came to.
pub fn check_answer(question: &str, answer: &str) -> AnswerCheck {
    CHECKERS
        .iter()
        .map(|check| check(question, answer))
        .find(|found| *found != AnswerCheck::Unchecked)
        .unwrap_or(AnswerCheck::Unchecked)
}
