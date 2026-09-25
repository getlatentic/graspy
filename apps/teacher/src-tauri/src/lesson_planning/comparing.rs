//! Checking that large numbers are put in the order they were asked for.
//!
//! A quantity written "0.055 trillion" is larger than one written "50.5
//! billion" and smaller than one written "800 billion", and the scale words
//! are what make that hard to see. The mistakes in real lessons are exactly
//! there: numbers arranged in the order the question listed them rather than
//! by size, and a comparison answered with the wrong one of the two.
//!
//! Only questions that name their quantities in digits are read. One that
//! spells them out in words is a different reading and is left alone.

use super::{
    mathematics::AnswerCheck,
    place_value::{leading_number, with_separators},
};

/// The direction a question asks for, where it asks for one.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Order {
    SmallestFirst,
    LargestFirst,
}

/// Whether the answer puts the quantities where the question asked them to go.
pub fn check_quantity_order(question: &str, answer: &str) -> AnswerCheck {
    let quantities = quantities_in(question);
    if quantities.len() < 2 {
        return AnswerCheck::Unchecked;
    }
    match asked_order(question) {
        Some(order) if quantities.len() > 2 => arranged(order, &quantities, answer),
        Some(order) => picked(order, &quantities, answer),
        None => AnswerCheck::Unchecked,
    }
}

/// A question with several quantities asks for all of them, in order.
fn arranged(order: Order, quantities: &[i128], answer: &str) -> AnswerCheck {
    let mut wanted = quantities.to_vec();
    wanted.sort_unstable();
    if order == Order::LargestFirst {
        wanted.reverse();
    }
    let written = quantities_in(answer);
    let listed = written
        .iter()
        .filter(|value| quantities.contains(value))
        .copied()
        .collect::<Vec<_>>();
    if listed.len() < wanted.len() {
        return AnswerCheck::Wrong(format!(
            "The answer arranges {} of the {} numbers the question gives.",
            listed.len(),
            wanted.len()
        ));
    }
    if listed[..wanted.len()] == wanted[..] {
        AnswerCheck::Correct
    } else {
        AnswerCheck::Wrong(format!(
            "The answer puts them in the order {}, and {} is the order asked for.",
            joined(&listed[..wanted.len()]),
            joined(&wanted)
        ))
    }
}

/// A question with two quantities asks which one, so the answer names it first.
fn picked(order: Order, quantities: &[i128], answer: &str) -> AnswerCheck {
    let wanted = match order {
        Order::SmallestFirst => quantities.iter().min(),
        Order::LargestFirst => quantities.iter().max(),
    };
    let Some(wanted) = wanted else {
        return AnswerCheck::Unchecked;
    };
    match quantities_in(answer).first() {
        Some(named) if named == wanted => AnswerCheck::Correct,
        Some(named) => AnswerCheck::Wrong(format!(
            "The answer leads with {}, and the question asks for {}.",
            with_separators(*named),
            with_separators(*wanted)
        )),
        None => AnswerCheck::Wrong(
            "The answer names neither of the numbers the question compares.".to_owned(),
        ),
    }
}

/// Which way round a question asks for, where it asks plainly.
fn asked_order(question: &str) -> Option<Order> {
    let question = question.to_lowercase();
    let smallest = ["smallest to", "least to", "ascending", "smaller", "smallest"]
        .iter()
        .any(|phrase| question.contains(phrase));
    let largest = ["largest to", "greatest to", "descending", "larger", "largest", "greater"]
        .iter()
        .any(|phrase| question.contains(phrase));
    // "from the smallest to the largest" names both, and the first names the end
    // it starts from.
    match (smallest, largest) {
        (true, true) => first_mentioned(&question),
        (true, false) => Some(Order::SmallestFirst),
        (false, true) => Some(Order::LargestFirst),
        (false, false) => None,
    }
}

fn first_mentioned(question: &str) -> Option<Order> {
    let smallest = ["smallest", "least", "smaller"]
        .iter()
        .filter_map(|word| question.find(word))
        .min();
    let largest = ["largest", "greatest", "larger"]
        .iter()
        .filter_map(|word| question.find(word))
        .min();
    match (smallest, largest) {
        (Some(small), Some(large)) if small < large => Some(Order::SmallestFirst),
        (Some(_), Some(_)) => Some(Order::LargestFirst),
        _ => None,
    }
}

/// Every quantity written in the text, in the order it appears.
///
/// A number with a scale word beside it counts as that scale: "0.055 trillion"
/// and "55,000,000,000" are the same quantity written two ways, and the point
/// of these questions is that they are hard to see as the same.
fn quantities_in(text: &str) -> Vec<i128> {
    let mut found = Vec::new();
    let mut rest = text;
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

fn joined(values: &[i128]) -> String {
    values
        .iter()
        .map(|value| with_separators(*value))
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// All of these sit in confirmed lessons in a real teacher's library.
    #[test]
    fn catches_the_orderings_shipped_lessons_get_wrong() {
        let wrong = [
            // 0.08 trillion is 80 billion, so 800 billion is the larger.
            (
                "Which number is larger, 0.08 trillion or 800 billion?",
                "0.08 trillion is larger than 800 billion.",
            ),
            // Listed in the order the question gave them, not by size.
            (
                "Arrange the following numbers from the smallest to the largest: \
                 50.5 billion; 0.055 trillion; 500.5 million.",
                "50.5 billion, 0.055 trillion, 500.5 million",
            ),
            // One number where three were asked for.
            (
                "Arrange the following numbers from the largest to the smallest: \
                 3,600 million; 3 billion; 0.36 trillion.",
                "0.36 trillion",
            ),
            // The lesson objective in place of an answer.
            (
                "Which number is larger: 5,000,000 or 5,000,000,000?",
                "Interpret the place value of a million and a billion.",
            ),
        ];
        for (question, answer) in wrong {
            assert!(
                matches!(check_quantity_order(question, answer), AnswerCheck::Wrong(_)),
                "{question}",
            );
        }
    }

    #[test]
    fn leaves_a_right_ordering_alone() {
        let right = [
            (
                "Which number is larger, 0.08 trillion or 800 billion?",
                "800 billion is larger than 0.08 trillion.",
            ),
            (
                "Arrange the following numbers from the smallest to the largest: \
                 50.5 billion; 0.055 trillion; 500.5 million.",
                "500.5 million, 50.5 billion, 0.055 trillion",
            ),
            (
                "Arrange the following numbers from the largest to the smallest: \
                 3,600 million; 3 billion; 0.36 trillion.",
                "0.36 trillion, 3.6 billion, 3 billion",
            ),
        ];
        for (question, answer) in right {
            assert_eq!(
                check_quantity_order(question, answer),
                AnswerCheck::Correct,
                "{question}",
            );
        }
    }

    /// A question that names one quantity, or none, is not asking for an order.
    #[test]
    fn stays_unchecked_where_there_is_no_order_to_check() {
        for (question, answer) in [
            ("Which number is larger?", "The one further left on the chart."),
            ("Write 5,000,000 in words.", "Five million"),
        ] {
            assert_eq!(
                check_quantity_order(question, answer),
                AnswerCheck::Unchecked,
                "{question}",
            );
        }
    }
}
