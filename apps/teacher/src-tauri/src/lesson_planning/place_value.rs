//! Checking that a lesson writes large numbers at the size it says they are.
//!
//! A question that names "12 billion" and asks for it in digits has exactly one
//! right answer, and a model that writes 12,000,000 has moved the value by a
//! factor of a thousand while the words around it still read correctly. Nothing
//! in the prose looks wrong; only the arithmetic does. `mathematics` holds the
//! fraction checks and knows nothing of scale, so this is its own concern.
//!
//! The rule here is deliberately narrow: an answer may not restate a quantity
//! the question named at a different scale. That is the mistake seen in a real
//! lesson, it is decidable without knowing what the question was driving at, and
//! it cannot fire on an answer that simply mentions a smaller unit in passing.
//! Everything else about the answer is other checks' business.

use super::mathematics::AnswerCheck;

/// The multipliers a lesson at this level uses by name.
/// The number a piece of text opens with, taking a scale word when one follows.
pub(super) fn leading_number(text: &str) -> Option<i128> {
    let text = text.trim_start();
    let digits: String = text
        .chars()
        .take_while(|character| character.is_ascii_digit() || *character == ',' || *character == '.')
        .collect();
    let digits = digits.trim_end_matches(['.', ',']);
    if digits.is_empty() {
        return None;
    }
    let after = text[digits.len()..].trim_start();
    let scale = SCALES
        .iter()
        .find(|(name, _)| after.starts_with(name))
        .map_or(1, |(_, scale)| *scale);
    scaled(digits, scale)
}

/// A decimal quantity of a scale, as a whole number of units.
///
/// Only exact values are read: a step the scale cannot divide evenly is not a
/// counting sequence over whole numbers, and rounding it would invent one.
pub(super) fn scaled(digits: &str, scale: i128) -> Option<i128> {
    let digits = digits.replace(',', "");
    let (whole, fraction) = digits.split_once('.').unwrap_or((digits.as_str(), ""));
    let whole: i128 = whole.parse().ok()?;
    if fraction.is_empty() {
        return whole.checked_mul(scale);
    }
    let places = 10i128.checked_pow(u32::try_from(fraction.len()).ok()?)?;
    let numerator: i128 = fraction.parse().ok()?;
    let part = numerator.checked_mul(scale)?;
    (part % places == 0).then(|| whole.checked_mul(scale).map(|base| base + part / places))?
}


const SCALES: [(&str, i128); 4] = [
    ("trillion", 1_000_000_000_000),
    ("billion", 1_000_000_000),
    ("million", 1_000_000),
    ("thousand", 1_000),
];

/// A quantity written the way a question states it: a number and a scale word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NamedQuantity {
    value: i128,
    scale: &'static str,
}

/// Every "10.5 billion" in a piece of text, as the number it denotes.
///
/// Decimals are read exactly rather than through floating point, because a
/// lesson's numbers must not depend on how a binary fraction rounds.
fn named_quantities(text: &str) -> Vec<NamedQuantity> {
    let lowered = text.to_lowercase();
    let mut found = Vec::new();
    for (scale, multiplier) in SCALES {
        for (index, _) in lowered.match_indices(scale) {
            if let Some(value) = quantity_before(&lowered[..index], multiplier) {
                found.push(NamedQuantity { value, scale });
            }
        }
    }
    found
}

/// The number immediately preceding a scale word, scaled by it.
fn quantity_before(before: &str, multiplier: i128) -> Option<i128> {
    let digits: String = before
        .chars()
        .rev()
        .skip_while(|character| character.is_whitespace())
        .take_while(|character| character.is_ascii_digit() || *character == '.')
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    scale_decimal(digits.trim_matches('.'), multiplier)
}

/// `10.5` at a multiplier of a billion is 10,500,000,000, computed by moving the
/// decimal rather than multiplying a float.
fn scale_decimal(literal: &str, multiplier: i128) -> Option<i128> {
    if literal.is_empty() {
        return None;
    }
    let (whole, fraction) = match literal.split_once('.') {
        Some((whole, fraction)) => (whole, fraction),
        None => (literal, ""),
    };
    let whole: i128 = if whole.is_empty() {
        0
    } else {
        whole.parse().ok()?
    };
    if fraction
        .chars()
        .any(|character| !character.is_ascii_digit())
    {
        return None;
    }
    let mut value = whole.checked_mul(multiplier)?;
    let mut place = multiplier;
    for digit in fraction.chars() {
        place /= 10;
        if place == 0 {
            // Finer than the scale can express; the digits below are the
            // question's own precision and not this check's business.
            break;
        }
        value = value.checked_add(i128::from(digit as u8 - b'0') * place)?;
    }
    Some(value)
}

/// Every plain digit group in a piece of text, commas and all.
fn written_numbers(text: &str) -> Vec<i128> {
    let mut found = Vec::new();
    let mut current = String::new();
    for character in text.chars() {
        if character.is_ascii_digit() || (character == ',' && !current.is_empty()) {
            current.push(character);
        } else {
            push_number(&mut found, &current);
            current.clear();
        }
    }
    push_number(&mut found, &current);
    found
}

fn push_number(found: &mut Vec<i128>, literal: &str) {
    let digits: String = literal.chars().filter(char::is_ascii_digit).collect();
    // A group written without separators below a thousand is a count, an index
    // or a year far more often than a quantity this check is about.
    if digits.len() < 4 && !literal.contains(',') {
        return;
    }
    if let Ok(value) = digits.parse::<i128>() {
        found.push(value);
    }
}

/// Rejects an answer that writes one of the question's quantities at the wrong
/// scale.
///
/// Only an exact factor of a thousand counts, in either direction, and only
/// against a quantity the question actually named. A near miss is a different
/// mistake and belongs to whatever check owns it; this one is about a number
/// that lost or gained a scale between the question and the answer.
pub fn validate_large_number_scale(question: &str, answer: &str) -> Result<(), String> {
    let asked = named_quantities(question);
    if asked.is_empty() {
        return Ok(());
    }
    let given = written_numbers(answer);
    if given.is_empty() {
        return Ok(());
    }

    for quantity in &asked {
        if given.contains(&quantity.value) {
            continue;
        }
        for slipped in given.iter().copied() {
            if slipped != 0 && is_thousandfold_slip(quantity.value, slipped) {
                return Err(format!(
                    "An expected answer writes {} as {}, which is the wrong size by a factor of a thousand. Write the digits for {} {}.",
                    with_separators(quantity.value),
                    with_separators(slipped),
                    with_separators(quantity.value),
                    quantity.scale,
                ));
            }
        }
    }
    Ok(())
}

fn is_thousandfold_slip(asked: i128, given: i128) -> bool {
    asked == given.saturating_mul(1_000) || given == asked.saturating_mul(1_000)
}

pub(super) fn with_separators(value: i128) -> String {
    let digits = value.abs().to_string();
    let mut grouped = String::new();
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(digit);
    }
    if value < 0 {
        format!("-{grouped}")
    } else {
        grouped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The lesson this check exists for. Found in the owner's library on
    /// 2026-07-30: a billions question answered in millions, with the scale
    /// words left reading correctly beside the wrong digits.
    #[test]
    fn a_billions_question_answered_in_millions_is_refused() {
        let error = validate_large_number_scale(
            "Count in 0.5 billions from 10.5 billion to 12 billion. Write down the numbers as digits only and include their full names.",
            "The numbers are: 10,500,000, 11,000,000, and 12,000,000. The names are: Ten and a half billion, Eleven million, and Twelve million.",
        )
        .expect_err("a thousandfold slip must be refused");

        assert!(
            error.contains("factor of a thousand"),
            "unexpected: {error}"
        );
        assert!(error.contains("10,500,000,000"), "unexpected: {error}");
    }

    /// The question sitting directly beside it in the same lesson, answered
    /// correctly. A check that cannot tell these apart is worse than none.
    #[test]
    fn the_same_question_answered_correctly_is_accepted() {
        validate_large_number_scale(
            "Count in 0.25 billions from 25 billion to 26.5 billion. Write down the numbers as digits only and include their full names.",
            "The numbers are: 25,000,000,000, 25,500,000,000, 26,000,000,000, and 26,500,000,000. The names are: Twenty-five billion, Twenty-five and a half billion, Twenty-six billion, and Twenty-six and a half billion.",
        )
        .expect("a correct answer must pass");
    }

    #[test]
    fn a_decimal_quantity_is_read_exactly() {
        validate_large_number_scale(
            "Express 0.15 billion in digits only.",
            "0.15 billion in digits only is 150,000,000.",
        )
        .expect("0.15 billion is 150,000,000");
    }

    #[test]
    fn a_question_naming_no_scale_is_not_this_check_to_judge() {
        validate_large_number_scale("Order 1/6, 1/3 and 1/2.", "1/6 < 1/3 < 1/2")
            .expect("nothing to check");
    }

    /// A billions answer may mention a million without being wrong, so long as
    /// it is not one of the question's own quantities moved by a thousand.
    #[test]
    fn mentioning_a_smaller_unit_in_passing_is_not_a_slip() {
        validate_large_number_scale(
            "Write 3 billion in digits.",
            "3 billion is 3,000,000,000, which is 3,000 lots of 1,000,000.",
        )
        .expect("a passing mention is not a slip");
    }

    #[test]
    fn a_number_the_question_never_named_is_left_alone() {
        validate_large_number_scale(
            "Write 4 billion in digits.",
            "4 billion is 4,000,000,000. The population was 8,200,000.",
        )
        .expect("an unrelated number is not this check's business");
    }

    #[test]
    fn separators_are_written_the_way_a_teacher_reads_them() {
        assert_eq!(with_separators(10_500_000_000), "10,500,000,000");
        assert_eq!(with_separators(150_000_000), "150,000,000");
        assert_eq!(with_separators(0), "0");
    }
}

/// The value an English number name states, where the words state one.
///
/// Written names are read rather than compared as text, because "five hundred
/// million" and "Five hundred million," and "500 million" all name the same
/// number, and only the value is worth holding an answer to.
pub fn value_of_number_words(text: &str) -> Option<i128> {
    let mut total: i128 = 0;
    let mut running: i128 = 0;
    let mut read_any = false;
    for word in text
        .to_lowercase()
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
    {
        if word == "and" {
            continue;
        }
        if word.chars().all(|character| character.is_ascii_digit()) {
            running += word.parse::<i128>().ok()?;
            read_any = true;
        } else if word == "hundred" {
            running = running.max(1) * 100;
            read_any = true;
        } else if let Some((_, value)) = SMALL_NAMES.iter().find(|(name, _)| *name == word) {
            running += value;
            read_any = true;
        } else if let Some((_, scale)) = SCALES.iter().find(|(name, _)| *name == word) {
            total += running.max(1) * scale;
            running = 0;
            read_any = true;
        } else {
            // The name has ended; whatever follows is prose about it.
            break;
        }
    }
    read_any.then_some(total + running)
}

const SMALL_NAMES: [(&str, i128); 28] = [
    ("zero", 0), ("one", 1), ("two", 2), ("three", 3), ("four", 4), ("five", 5), ("six", 6),
    ("seven", 7), ("eight", 8), ("nine", 9), ("ten", 10), ("eleven", 11), ("twelve", 12),
    ("thirteen", 13), ("fourteen", 14), ("fifteen", 15), ("sixteen", 16), ("seventeen", 17),
    ("eighteen", 18), ("nineteen", 19), ("twenty", 20), ("thirty", 30), ("forty", 40),
    ("fifty", 50), ("sixty", 60), ("seventy", 70), ("eighty", 80), ("ninety", 90),
];

/// Whether a question asks for a number to be written out in words.
fn asks_for_the_name(question: &str) -> bool {
    let question = question.to_lowercase();
    question.contains("in words") || question.contains("full name")
}

/// Whether the answer names the number the question asked to be written out.
///
/// Narrow on purpose, in the spirit of the scale rule above: it reads only a
/// question that asks for a name and puts exactly one whole number in front of
/// the reader. Anything looser starts guessing which of several numbers the
/// name was for.
pub fn check_number_name(question: &str, answer: &str) -> AnswerCheck {
    if !asks_for_the_name(question) {
        return AnswerCheck::Unchecked;
    }
    let [asked] = written_numbers(question)[..] else {
        return AnswerCheck::Unchecked;
    };
    let Some(named) = value_of_number_words(first_name_in(answer)) else {
        return AnswerCheck::Unchecked;
    };
    if named == asked {
        AnswerCheck::Correct
    } else {
        AnswerCheck::Wrong(format!(
            "The answer names {}, and the question asks for {}.",
            with_separators(named),
            with_separators(asked)
        ))
    }
}

/// The part of an answer that reads as a written-out number, skipping what
/// leads up to it — an answer says "The full name is Eight hundred thousand".
fn first_name_in(answer: &str) -> &str {
    let lowered = answer.to_lowercase();
    SMALL_NAMES
        .iter()
        .filter_map(|(name, _)| word_start(&lowered, name))
        .min()
        .map_or(answer, |start| &answer[start..])
}

/// Where a whole word begins in the text, if it appears as one.
fn word_start(text: &str, word: &str) -> Option<usize> {
    text.match_indices(word)
        .find(|(index, _)| {
            let before = *index == 0 || !text.as_bytes()[index - 1].is_ascii_alphanumeric();
            let after_index = index + word.len();
            let after = after_index >= text.len()
                || !text.as_bytes()[after_index].is_ascii_alphanumeric();
            before && after
        })
        .map(|(index, _)| index)
}

#[cfg(test)]
mod number_name_tests {
    use super::*;

    /// This exact answer sits in a confirmed lesson in a real teacher's
    /// library, handed over as correct. 500,000,000 is five hundred million.
    #[test]
    fn catches_the_wrong_name_a_shipped_lesson_carries() {
        let found = check_number_name(
            "Recall the correct way to write the number 500,000,000 in words, using place value.",
            "One hundred million (or 100,000,000)",
        );
        let AnswerCheck::Wrong(why) = found else {
            panic!("a wrong name must read as wrong, got {found:?}");
        };
        assert!(why.contains("100,000,000") && why.contains("500,000,000"), "{why}");
    }

    #[test]
    fn reads_the_names_the_lessons_write() {
        for (question, answer) in [
            ("Write in billions. Write the number 1,000,000,000 in words.", "One billion"),
            ("Write the number 1,000,000 in words.", "One million"),
            (
                "Write the number 6,607,000,000,000 in words so a reader can follow it.",
                "In words, the number is Six trillion, six hundred and seven billion",
            ),
        ] {
            assert_eq!(check_number_name(question, answer), AnswerCheck::Correct, "{question}");
        }
    }

    /// Reading a name off a question that puts several numbers in front of the
    /// reader would be guessing which one it meant.
    #[test]
    fn stays_unchecked_where_it_would_have_to_guess() {
        for (question, answer) in [
            ("Count in millions from 216,154,100 to 221,154,100 and write them in words.", "Two hundred and sixteen million"),
            ("Express 0.835 million in digits only.", "835,000"),
        ] {
            assert_eq!(check_number_name(question, answer), AnswerCheck::Unchecked, "{question}");
        }
    }
}

/// Whether a question asks for a quantity to be written out in digits.
fn asks_for_digits(question: &str) -> bool {
    let question = question.to_lowercase();
    question.contains("in digits") || question.contains("in figures")
}

/// The one quantity a question states as a number and a scale — "0.835
/// million" — where it states exactly one.
///
/// Exactly one, because a question naming two is asking about a relationship
/// between them and reading either as the answer would be a guess.
fn stated_quantity(question: &str) -> Option<i128> {
    let lowered = question.to_lowercase();
    let mut found = None;
    for (name, _) in SCALES {
        let mut from = 0;
        while let Some(at) = lowered[from..].find(name) {
            let at = from + at;
            from = at + name.len();
            let before = lowered[..at].trim_end();
            let digits_start = before
                .rfind(|character: char| !character.is_ascii_digit() && character != '.' && character != ',')
                .map_or(0, |index| index + 1);
            let Some(value) = leading_number(&lowered[digits_start..]) else {
                continue;
            };
            if found.is_some_and(|already| already != value) {
                return None;
            }
            found = Some(value);
        }
    }
    found
}

/// Whether the answer writes the quantity the question stated, in digits and —
/// where the question asks for it — in words as well.
///
/// The two are checked together because a lesson gets one right and the other
/// wrong: 20.05 million is written 20,050,000 and then named "Twenty million,
/// five thousand", which is 20,005,000.
pub fn check_stated_quantity(question: &str, answer: &str) -> AnswerCheck {
    if !asks_for_digits(question) {
        return AnswerCheck::Unchecked;
    }
    let Some(asked) = stated_quantity(question) else {
        return AnswerCheck::Unchecked;
    };
    if !written_numbers(answer).contains(&asked) {
        return AnswerCheck::Wrong(format!(
            "The answer does not write {} in digits.",
            with_separators(asked)
        ));
    }
    if !asks_for_the_name(question) {
        return AnswerCheck::Correct;
    }
    match value_of_number_words(first_name_in(answer)) {
        Some(named) if named != asked => AnswerCheck::Wrong(format!(
            "The answer names {}, and the question states {}.",
            with_separators(named),
            with_separators(asked)
        )),
        // The digits are right and no name was written to disagree with them.
        _ => AnswerCheck::Correct,
    }
}

#[cfg(test)]
mod stated_quantity_tests {
    use super::*;

    /// The digits are right and the name is not, in a confirmed lesson:
    /// 20.05 million is 20,050,000, and "Twenty million, five thousand" is
    /// 20,005,000.
    #[test]
    fn catches_a_name_that_disagrees_with_its_own_digits() {
        let found = check_stated_quantity(
            "Express 20.05 million in digits only, and write out its full name.",
            "20.05 million in digits only is 20,050,000. The full name is Twenty million, five thousand.",
        );
        let AnswerCheck::Wrong(why) = found else {
            panic!("a name that contradicts the digits must read as wrong, got {found:?}");
        };
        assert!(why.contains("20,005,000") && why.contains("20,050,000"), "{why}");
    }

    #[test]
    fn reads_the_quantities_the_lessons_write_correctly() {
        for (question, answer) in [
            (
                "Express 0.835 million in digits only, and write out its full name.",
                "0.835 million in digits only is 835,000. The full name is Eight hundred and thirty-five thousand.",
            ),
            (
                "Express 3.45 billion in digits only, and write out its full name.",
                "3.45 billion in digits only is 3,450,000,000. The full name is Three billion, four hundred and fifty million.",
            ),
            (
                "Express 175.5 million in digits only, and write out its full name.",
                "175.5 million in digits only is 175,500,000. The full name is One hundred and seventy-five million, five hundred thousand.",
            ),
        ] {
            assert_eq!(check_stated_quantity(question, answer), AnswerCheck::Correct, "{question}");
        }
    }

    #[test]
    fn catches_digits_written_at_the_wrong_size() {
        assert!(matches!(
            check_stated_quantity(
                "Express 0.5 billion in digits only.",
                "0.5 billion in digits only is 500,000.",
            ),
            AnswerCheck::Wrong(_),
        ));
    }

    /// A question naming two quantities is asking about the pair, and reading
    /// either one as the answer would be a guess.
    #[test]
    fn stays_unchecked_where_two_quantities_are_named() {
        assert_eq!(
            check_stated_quantity(
                "Write 1.5 million and 5.5 million in digits only.",
                "1,500,000 and 5,500,000",
            ),
            AnswerCheck::Unchecked,
        );
    }
}
