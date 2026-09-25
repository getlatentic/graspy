//! Checking that a counting sequence counts the way it was asked to.
//!
//! "Count in 0.5 billions from 10.5 billion to 12 billion" names every number
//! it wants, so an answer either has them or does not. The mistakes seen in
//! real lessons are all of that kind: counting in ones where threes were asked
//! for, writing billions as millions, or answering with the objective instead
//! of the numbers.
//!
//! Only questions that name a step and both ends are read. A question whose
//! bounds are spelled out in words, or that asks for something other than a
//! run of numbers, is left alone rather than guessed at.

use super::{
    mathematics::AnswerCheck,
    place_value::{leading_number, scaled, with_separators},
};

/// The largest run worth checking. A longer one is not a counting exercise a
/// class works through, and building it would say more about the parsing than
/// about the answer.
const LONGEST_RUN: usize = 200;

const SCALES: [(&str, i128); 4] = [
    ("thousand", 1_000),
    ("million", 1_000_000),
    ("billion", 1_000_000_000),
    ("trillion", 1_000_000_000_000),
];

/// What a counting question asks for.
struct Counted {
    start: i128,
    step: i128,
    end: i128,
}

impl Counted {
    /// Every number the question asks to be written down.
    fn expected(&self) -> Option<Vec<i128>> {
        let span = self.end.checked_sub(self.start)?;
        if self.step <= 0 || span <= 0 || span % self.step != 0 {
            return None;
        }
        let steps = usize::try_from(span / self.step).ok()?;
        (steps <= LONGEST_RUN)
            .then(|| (0..=steps).map(|index| self.start + self.step * index as i128).collect())
    }
}

/// Whether the answer counts the way the question asked.
pub fn check_counting_sequence(question: &str, answer: &str) -> AnswerCheck {
    let Some(asked) = counting_question(question) else {
        return AnswerCheck::Unchecked;
    };
    let Some(expected) = asked.expected() else {
        return AnswerCheck::Unchecked;
    };
    let written = numbers_in(answer);

    if let Some(missing) = expected.iter().find(|value| !written.contains(value)) {
        return AnswerCheck::Wrong(format!(
            "The answer leaves out {}, which counting from {} to {} in steps of {} reaches.",
            with_separators(*missing),
            with_separators(asked.start),
            with_separators(asked.end),
            with_separators(asked.step),
        ));
    }
    if let Some(extra) = written
        .iter()
        .find(|value| **value > asked.start && **value < asked.end && !expected.contains(value))
    {
        return AnswerCheck::Wrong(format!(
            "The answer counts through {}, which a step of {} does not reach.",
            with_separators(*extra),
            with_separators(asked.step),
        ));
    }
    AnswerCheck::Correct
}

/// The step and both ends, where the question states all three.
///
/// Two phrasings say the same thing — the step before the range or after it —
/// and a lesson uses both.
fn counting_question(question: &str) -> Option<Counted> {
    let lowered = question.to_lowercase();
    let counting = lowered.find("count")?;
    let rest = &lowered[counting..];
    let from = rest.find(" from ")? + " from ".len();
    let to = rest[from..].find(" to ")? + from + " to ".len();

    let start = leading_number(&rest[from..])?;
    let end = leading_number(&rest[to..])?;
    let step = step_size(&rest[..from], &rest[to..])?;
    Some(Counted { start, step, end })
}

/// How much each count moves, said either before the range or after it.
fn step_size(before: &str, after: &str) -> Option<i128> {
    stated_step(before).or_else(|| stated_step(after))
}

/// A step written as "in millions", "in 0.5 billions" or "in 3 trillions".
fn stated_step(text: &str) -> Option<i128> {
    let marker = text.rfind(" in ")? + " in ".len();
    let stated = text[marker..].trim_start();
    let (scale_name, scale) = SCALES
        .iter()
        .find(|(name, _)| stated.starts_with(name) || stated.split_whitespace().nth(1).is_some_and(|word| word.starts_with(*name)))?;
    if stated.starts_with(scale_name) {
        return Some(*scale);
    }
    scaled(stated.split_whitespace().next()?, *scale)
}

/// Every number written in the answer, taking a scale word when one follows.
///
/// Spelled-out names are left out on purpose: an answer that gives the digits
/// and then the names would otherwise read as twice as many numbers as it has.
fn numbers_in(answer: &str) -> Vec<i128> {
    let mut found = Vec::new();
    let mut rest = answer;
    while let Some(start) = rest.find(|character: char| character.is_ascii_digit()) {
        rest = &rest[start..];
        if let Some(value) = leading_number(rest) {
            found.push(value);
        }
        let consumed = rest
            .find(|character: char| !character.is_ascii_digit() && character != ',' && character != '.')
            .unwrap_or(rest.len());
        rest = &rest[consumed.max(1)..];
    }
    found
}


#[cfg(test)]
mod tests {
    use super::*;

    /// Every one of these sits in a confirmed lesson in a real teacher's
    /// library, handed over as correct.
    #[test]
    fn catches_the_counting_mistakes_shipped_lessons_carry() {
        let wrong = [
            (
                "Count in 0.5 billions from 10.5 billion to 12 billion. Write the numbers.",
                "The numbers are: 10,500,000, 11,000,000, and 12,000,000.",
            ),
            (
                "Based on Exercise 1.12, count in 3 trillions from 987 trillion to 999 trillion.",
                "987 trillion, 988 trillion, 989 trillion, 990 trillion, 991 trillion.",
            ),
            // Every number it was asked for is here, and thirty it was not:
            // the run counts in tenths where it was asked to count in ones.
            (
                "Count in trillions from 3.5 trillion to 6.5 trillion. Write the numbers.",
                "3.5 trillion, 3.6 trillion, 3.7 trillion, 3.8 trillion, 3.9 trillion, \
                 4 trillion, 4.1 trillion, 4.2 trillion, 4.3 trillion, 4.4 trillion, \
                 4.5 trillion, 4.6 trillion, 4.7 trillion, 4.8 trillion, 4.9 trillion, \
                 5 trillion, 5.1 trillion, 5.2 trillion, 5.3 trillion, 5.4 trillion, \
                 5.5 trillion, 5.6 trillion, 5.7 trillion, 5.8 trillion, 5.9 trillion, \
                 6 trillion, 6.1 trillion, 6.2 trillion, 6.3 trillion, 6.4 trillion, \
                 6.5 trillion.",
            ),
            (
                "Count in 0.5 billions from 10.5 billion to 12 billion. Write the numbers.",
                "Count forward in millions and billions using place-value patterns.",
            ),
        ];
        for (question, answer) in wrong {
            assert!(
                matches!(check_counting_sequence(question, answer), AnswerCheck::Wrong(_)),
                "{question}",
            );
        }
    }

    /// And these are the ones the same lessons got right, which must stay right
    /// — a checker that fails good answers is worse than none.
    #[test]
    fn leaves_the_sequences_that_do_count_correctly_alone() {
        let right = [
            (
                "Count in millions from 3 million to 7 million. Write down the numbers.",
                "3 million, 4 million, 5 million, 6 million, 7 million",
            ),
            (
                "Count in billions from 4 billion to 6 billion. Write down the numbers.",
                "4 billion, 5 billion, 6 billion",
            ),
            (
                "Count in millions from 1.5 million to 5.5 million. Write the numbers and names.",
                "The numbers are: 1,500,000, 2,500,000, 3,500,000, 4,500,000, and 5,500,000. \
                 The names are: One and a half million, Two and a half million.",
            ),
        ];
        for (question, answer) in right {
            assert_eq!(
                check_counting_sequence(question, answer),
                AnswerCheck::Correct,
                "{question}",
            );
        }
    }

    /// A question whose ends are spelled out, or that asks for something other
    /// than a run of numbers, is left alone rather than guessed at.
    #[test]
    fn stays_unchecked_where_the_question_does_not_name_a_run() {
        for (question, answer) in [
            (
                "Count in millions. What is the number that represents one million in digits?",
                "1,000,000",
            ),
            (
                "Count in millions from two hundred and sixteen million to two hundred and twenty one million.",
                "216,000,001 and 221,154,100",
            ),
        ] {
            assert_eq!(
                check_counting_sequence(question, answer),
                AnswerCheck::Unchecked,
                "{question}",
            );
        }
    }
}
