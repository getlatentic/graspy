use std::cmp::Ordering;
use std::collections::BTreeSet;
use std::ops::Range;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Fraction {
    numerator: i64,
    denominator: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FractionToken {
    value: Fraction,
    literal: String,
    span: Range<usize>,
}

impl Fraction {
    fn new(numerator: i64, denominator: i64) -> Option<Self> {
        if denominator == 0 {
            return None;
        }
        let sign = if denominator < 0 { -1 } else { 1 };
        let numerator = numerator * sign;
        let denominator = denominator.abs();
        let divisor = greatest_common_divisor(numerator.unsigned_abs(), denominator as u64) as i64;
        Some(Self {
            numerator: numerator / divisor,
            denominator: denominator / divisor,
        })
    }

    fn compare_value(self, other: Self) -> std::cmp::Ordering {
        (self.numerator as i128 * other.denominator as i128)
            .cmp(&(other.numerator as i128 * self.denominator as i128))
    }
}

/// What checking one answer came to.
///
/// "Nothing here reads this question" and "the answer is right" are different
/// facts about a lesson a teacher is about to hand out, and a type that returns
/// the same value for both hands them an unchecked answer wearing the face of a
/// checked one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnswerCheck {
    /// The answer follows from the question.
    Correct,
    /// It does not, and this is what is wrong with it.
    Wrong(String),
    /// No checker graspy has can read this question, so none of them vouches
    /// for the answer.
    Unchecked,
}

impl AnswerCheck {
    /// Whether the answer was read and found wanting. An answer nothing could
    /// read is not wrong — it is unvouched for, which is a different report.
    #[cfg(test)]
    pub fn is_wrong(&self) -> bool {
        matches!(self, Self::Wrong(_))
    }

    /// A failure only where the answer was read and found wrong.
    ///
    /// A stage refuses a lesson over an answer it read and disagreed with, and
    /// not over one it has no checker for — refusing that would stop graspy
    /// writing any lesson outside the topics it can verify. What went unchecked
    /// is reported where a lesson's answer coverage is, rather than here.
    pub fn only_when_wrong(self) -> Result<(), String> {
        match self {
            Self::Wrong(why) => Err(why),
            Self::Correct | Self::Unchecked => Ok(()),
        }
    }
}


/// Which of two fractions a question asks a learner to name.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Wanted {
    Greater,
    Lesser,
}

/// What a side-by-side question asks for, where it asks for one of the two.
///
/// "Compare 2/5 and 3/5" is deliberately not here: it names no single answer,
/// so there is nothing to hold one against.
fn comparison_wanted(question: &str) -> Option<Wanted> {
    let question = question.to_lowercase();
    let greater = ["greater", "larger", "bigger", "more"]
        .iter()
        .any(|word| question.contains(word));
    let lesser = ["less", "smaller"].iter().any(|word| question.contains(word));
    match (greater, lesser) {
        (true, false) => Some(Wanted::Greater),
        (false, true) => Some(Wanted::Lesser),
        _ => None,
    }
}

/// The answer to a question that puts exactly two fractions side by side.
///
/// The two written fractions are the guard rather than the wording: a question
/// about whole numbers produces no operands however it is phrased, and one
/// naming three fractions is an ordering question rather than this.
fn check_comparison_answer(question: &str, answer: &str) -> AnswerCheck {
    let Some(wanted) = comparison_wanted(question) else {
        return AnswerCheck::Unchecked;
    };
    let mut written = BTreeSet::new();
    let mut operands = extract_fraction_tokens(question);
    operands.retain(|operand| written.insert(operand.literal.clone()));
    let Ok([left, right]) = <[FractionToken; 2]>::try_from(operands) else {
        return AnswerCheck::Unchecked;
    };
    let order = left.value.compare_value(right.value);
    if order == Ordering::Equal {
        // Neither is the greater, so the question has no answer of the shape it
        // asks for and reading one out of the response would be guesswork.
        return AnswerCheck::Unchecked;
    }
    let (greater, lesser) = if order == Ordering::Greater {
        (left, right)
    } else {
        (right, left)
    };
    let expected = match wanted {
        Wanted::Greater => greater,
        Wanted::Lesser => lesser,
    };
    let Some(named) = extract_fraction_tokens(answer).into_iter().next() else {
        return AnswerCheck::Wrong(
            "The answer must name one of the two fractions in the question.".to_owned(),
        );
    };
    if named.value == expected.value {
        AnswerCheck::Correct
    } else {
        AnswerCheck::Wrong(format!(
            "The answer names {} where the question asks for {}.",
            named.literal, expected.literal
        ))
    }
}

/// Whether the answer written for a fraction question follows from it.
///
/// Three shapes are read: an ordering that states its direction, an ordering
/// whose question does not but whose answer does, and a question putting two
/// fractions side by side. Anything else comes back unchecked and says so.
pub fn check_fraction_answer(question: &str, answer: &str) -> AnswerCheck {
    match check_ordering_answer(question, answer) {
        AnswerCheck::Unchecked => check_comparison_answer(question, answer),
        read => read,
    }
}

/// Whether a question asks for fractions to be put in an order at all.
fn asks_to_order(question: &str) -> bool {
    let question = question.to_lowercase();
    question.contains("order") || question.contains("arrange")
}

/// The direction an answer commits to by how it writes the sequence.
///
/// A question that says only "order these" has two right answers, and which one
/// was meant is settled by the answer itself rather than left unread.
fn direction_stated_in(answer: &str) -> Option<bool> {
    let ascending = answer.contains('<');
    let descending = answer.contains('>');
    match (ascending, descending) {
        (true, false) => Some(true),
        (false, true) => Some(false),
        _ => None,
    }
}

fn check_ordering_answer(question: &str, response: &str) -> AnswerCheck {
    if !asks_to_order(question) {
        return AnswerCheck::Unchecked;
    }
    let Some(ascending) = ordering_direction(question).or_else(|| direction_stated_in(response))
    else {
        return AnswerCheck::Unchecked;
    };

    let expected = extract_fractions(question);
    let expected_set = expected.iter().copied().collect::<BTreeSet<_>>();
    if expected_set.len() < 2 {
        return AnswerCheck::Unchecked;
    }
    let response_fractions = extract_fractions(response);
    let Some(answer) = response_fractions
        .windows(expected_set.len())
        .rev()
        .find(|window| window.iter().copied().collect::<BTreeSet<_>>() == expected_set)
    else {
        return AnswerCheck::Wrong(
            "The answer must include every fraction from the ordering question.".to_owned(),
        );
    };
    let correctly_ordered = answer.windows(2).all(|pair| {
        let order = pair[0].compare_value(pair[1]);
        if ascending {
            order.is_lt()
        } else {
            order.is_gt()
        }
    });
    if correctly_ordered {
        AnswerCheck::Correct
    } else {
        AnswerCheck::Wrong("The fractions in the answer are not in the requested order.".to_owned())
    }
}

pub fn validate_fraction_ordering_worked_example(
    learning_objective: &str,
    problem: &str,
    response: &str,
) -> Result<(), String> {
    if !requires_fraction_ordering(learning_objective) {
        return Ok(());
    }
    validate_direct_fraction_ordering_task(
        learning_objective,
        problem,
        response,
        "A worked example for a fraction-ordering objective",
    )
}

pub fn validate_fraction_ordering_practice(
    learning_objective: &str,
    worked_example_problems: &[&str],
    question: &str,
    response: &str,
) -> Result<(), String> {
    if !requires_fraction_ordering(learning_objective) {
        return Ok(());
    }
    validate_direct_fraction_ordering_task(
        learning_objective,
        question,
        response,
        "Practice for a fraction-ordering objective",
    )?;

    let practice_values = extract_fractions(question)
        .into_iter()
        .collect::<BTreeSet<_>>();
    if worked_example_problems.iter().any(|problem| {
        let example_values = extract_fractions(problem)
            .into_iter()
            .collect::<BTreeSet<_>>();
        example_values.len() >= 2 && example_values == practice_values
    }) {
        return Err(
            "Fraction-ordering practice must use different values from the worked example."
                .to_owned(),
        );
    }
    Ok(())
}

fn validate_direct_fraction_ordering_task(
    learning_objective: &str,
    question: &str,
    response: &str,
    task_name: &str,
) -> Result<(), String> {
    let Some(question_direction) = ordering_direction(question) else {
        return Err(format!(
            "{task_name} must ask learners to order fractions in a stated direction."
        ));
    };
    if let Some(objective_direction) = ordering_direction(learning_objective) {
        if objective_direction != question_direction {
            return Err(
                "Practice must use the ordering direction stated by the lesson objective."
                    .to_owned(),
            );
        }
    }
    if extract_fractions(question)
        .into_iter()
        .collect::<BTreeSet<_>>()
        .len()
        < 2
    {
        return Err(format!(
            "{task_name} must include at least two fractions to order."
        ));
    }
    match check_fraction_answer(question, response) {
        AnswerCheck::Wrong(why) => Err(why),
        // The objective said this is fraction ordering, so a question no
        // checker can read has already failed the checks above.
        AnswerCheck::Correct | AnswerCheck::Unchecked => Ok(()),
    }
}

fn requires_fraction_ordering(text: &str) -> bool {
    let normalized = text.to_lowercase();
    normalized.contains("fraction")
        && (normalized.contains("order") || normalized.contains("arrange"))
}

pub fn canonical_fraction_answer(question: &str) -> Option<String> {
    canonical_fraction_ordering_answer(question)
        .or_else(|| canonical_fraction_comparison_answer(question))
}

fn canonical_fraction_ordering_answer(question: &str) -> Option<String> {
    let ascending = ordering_direction(question)?;
    let mut fractions = extract_fraction_tokens(question);
    let mut unique = BTreeSet::new();
    fractions.retain(|fraction| unique.insert(fraction.value));
    if fractions.len() < 2 {
        return None;
    }
    fractions.sort_by(|left, right| {
        let order = left.value.compare_value(right.value);
        if ascending {
            order
        } else {
            order.reverse()
        }
    });
    let operator = if ascending { " < " } else { " > " };
    Some(
        fractions
            .iter()
            .map(|fraction| fraction.literal.as_str())
            .collect::<Vec<_>>()
            .join(operator),
    )
}

/// The answer to a question that puts two fractions side by side, written with
/// the greater one first, or as an equality when the two name the same value.
///
/// Equivalent fractions are the point of the comparison rather than a duplicate
/// to discard, so operands are separated by how they are written and not by what
/// they are worth. A model asked to carry the answer itself states a value the
/// question never showed.
pub fn canonical_fraction_comparison_answer(question: &str) -> Option<String> {
    let (left, right) = comparison_operands(question)?;
    if left.value.compare_value(right.value) == Ordering::Equal {
        return Some(format!("{} = {}", left.literal, right.literal));
    }
    let (greater, lesser) = if left.value.compare_value(right.value) == Ordering::Greater {
        (left, right)
    } else {
        (right, left)
    };
    Some(format!("{} > {}", greater.literal, lesser.literal))
}

fn comparison_operands(question: &str) -> Option<(FractionToken, FractionToken)> {
    if !requests_fraction_comparison(question) {
        return None;
    }
    let mut written = BTreeSet::new();
    let mut operands = extract_fraction_tokens(question);
    operands.retain(|operand| written.insert(operand.literal.clone()));
    let [left, right] = <[FractionToken; 2]>::try_from(operands).ok()?;
    Some((left, right))
}

fn requests_fraction_comparison(question: &str) -> bool {
    let question = question.to_lowercase();
    question.contains("compare")
        || question.contains("which fraction is greater")
        || question.contains("which fraction is less")
}

/// Whether the answer to a question is the values it states put in a new
/// arrangement, which is what ordering and comparison both ask for.
fn rearranges_stated_fractions(question: &str) -> bool {
    requires_fraction_ordering(question)
        || ordering_direction(question).is_some()
        || requests_fraction_comparison(question)
}

/// Rejects an expected answer that states a fraction its question never shows.
///
/// Ordering and comparison ask for the question's own values in a new
/// arrangement, so every fraction in the answer has to be one the question
/// states. A model that loses the thread mid-question carries in a value the
/// learner was never given, which no check tied to a single topic would see.
///
/// Equivalent forms are accepted, because rewriting the stated values over a
/// common denominator is the working the question asks for. Questions that ask
/// learners to calculate are left alone, since a sum or a difference is a new
/// value by design, as are questions that state no fractions at all.
pub fn validate_answer_fraction_provenance(question: &str, answer: &str) -> Result<(), String> {
    if !rearranges_stated_fractions(question) {
        return Ok(());
    }
    let stated = extract_fractions(question)
        .into_iter()
        .collect::<BTreeSet<_>>();
    if stated.is_empty() {
        return Ok(());
    }
    match extract_fraction_tokens(answer)
        .into_iter()
        .find(|token| !stated.contains(&token.value))
    {
        Some(unstated) => Err(format!(
            "The expected answer states {}, which its question does not ask about.",
            unstated.literal
        )),
        None => Ok(()),
    }
}

/// Rejects a question a learner could not act on as written.
///
/// Answers for these tasks are worked out in code, so a sampling artifact that
/// lands in the question text leaves the expected answer correct and reaches
/// the teacher unchallenged. A doubled relation symbol, a relation left hanging
/// at the end of the text, and a comparison that already states its own result
/// are each unusable in front of a class.
///
/// Only a relation written directly between two fractions counts as stating the
/// result. A question that defines a value, separates its fractions into a
/// list, or writes them in LaTeX asserts nothing about how they relate.
pub fn validate_lesson_question_text(question: &str) -> Result<(), String> {
    let symbols = relation_symbols(question);
    if let Some(repeated) = repeated_relation_symbol(question, &symbols) {
        return Err(format!(
            "The question writes \"{repeated}\" with nothing between the two symbols."
        ));
    }
    if let Some(dangling) = dangling_relation_symbol(question, &symbols) {
        return Err(format!(
            "The question ends with \"{dangling}\" and never states what is being related."
        ));
    }
    if let Some(stated) = stated_fraction_relation(question, &symbols) {
        return Err(format!(
            "The question states \"{stated}\", which is what it asks the learner to work out."
        ));
    }
    Ok(())
}

/// Longest first, so that a two-character symbol is read whole and not as the
/// pair of symbols it begins with.
const RELATION_SYMBOLS: [&str; 9] = ["<=", ">=", "≤", "≥", "≠", "≈", "<", ">", "="];

struct RelationSymbol {
    text: &'static str,
    span: Range<usize>,
}

fn relation_symbols(question: &str) -> Vec<RelationSymbol> {
    let mut found: Vec<RelationSymbol> = Vec::new();
    for (index, _) in question.char_indices() {
        if found.last().is_some_and(|last| last.span.end > index) {
            continue;
        }
        if let Some(text) = RELATION_SYMBOLS
            .into_iter()
            .find(|symbol| question[index..].starts_with(symbol))
        {
            found.push(RelationSymbol {
                text,
                span: index..index + text.len(),
            });
        }
    }
    found
}

fn repeated_relation_symbol(question: &str, symbols: &[RelationSymbol]) -> Option<String> {
    symbols.windows(2).find_map(|pair| {
        (pair[0].text == pair[1].text && adjoins(question, &pair[0].span, &pair[1].span))
            .then(|| question[pair[0].span.start..pair[1].span.end].to_owned())
    })
}

fn dangling_relation_symbol(question: &str, symbols: &[RelationSymbol]) -> Option<&'static str> {
    let last = symbols.last()?;
    question[last.span.end..]
        .trim()
        .is_empty()
        .then_some(last.text)
}

fn stated_fraction_relation(question: &str, symbols: &[RelationSymbol]) -> Option<String> {
    if !rearranges_stated_fractions(question) {
        return None;
    }
    let fractions = extract_fraction_tokens(question);
    symbols.iter().find_map(|symbol| {
        let left = fractions
            .iter()
            .find(|fraction| adjoins(question, &fraction.span, &symbol.span))?;
        let right = fractions
            .iter()
            .find(|fraction| adjoins(question, &symbol.span, &fraction.span))?;
        Some(format!(
            "{} {} {}",
            left.literal, symbol.text, right.literal
        ))
    })
}

/// Whether the two spans are separated by whitespace alone, in the order given.
fn adjoins(question: &str, before: &Range<usize>, after: &Range<usize>) -> bool {
    before.end <= after.start && question[before.end..after.start].trim().is_empty()
}

pub fn fraction_ordering_value_set_signature(question: &str) -> Option<String> {
    ordering_direction(question)?;
    let fractions = extract_fractions(question)
        .into_iter()
        .collect::<BTreeSet<_>>();
    if fractions.len() < 2 {
        return None;
    }
    Some(
        fractions
            .iter()
            .map(|fraction| format!("{}/{}", fraction.numerator, fraction.denominator))
            .collect::<Vec<_>>()
            .join("|"),
    )
}

pub fn has_same_fraction_ordering_direction(left: &str, right: &str) -> bool {
    ordering_direction(left)
        .zip(ordering_direction(right))
        .is_some_and(|(left, right)| left == right)
}

/// True only when both texts state an ordering direction and the two disagree.
/// A text that states no direction conflicts with nothing: a question can still
/// be written from it towards either direction.
pub fn conflicting_fraction_ordering_directions(left: &str, right: &str) -> bool {
    ordering_direction(left)
        .zip(ordering_direction(right))
        .is_some_and(|(left, right)| left != right)
}

pub fn fraction_ordering_practice_hints(question: &str) -> Option<Vec<String>> {
    let ascending = ordering_direction(question)?;
    if extract_fractions(question)
        .into_iter()
        .collect::<BTreeSet<_>>()
        .len()
        < 2
    {
        return None;
    }
    let direction = if ascending {
        "smallest to largest"
    } else {
        "largest to smallest"
    };
    Some(vec![
        "Find the lowest common denominator for all the fractions.".to_owned(),
        "Rewrite every fraction as an equivalent fraction with that common denominator.".to_owned(),
        format!("Compare the new numerators, then write the original fractions from {direction}."),
    ])
}

pub fn validate_fraction_ordering_hints(question: &str, hints: &[String]) -> Result<(), String> {
    if ordering_direction(question).is_none() {
        return Ok(());
    }
    let expected_denominators = extract_written_denominators(question);
    if expected_denominators.len() < 2 {
        return Ok(());
    }
    for hint in hints {
        let normalized = hint.to_lowercase();
        let Some(denominator_index) = normalized.find("denominator") else {
            continue;
        };
        let suffix = &hint[denominator_index..];
        let Some(open_index) = suffix.find('(') else {
            continue;
        };
        let Some(close_offset) = suffix[open_index + 1..].find(')') else {
            continue;
        };
        let written = extract_integers(&suffix[open_index + 1..open_index + 1 + close_offset]);
        if written.len() >= 2 && written != expected_denominators {
            return Err(
                "A fraction-ordering hint names denominators that do not match its practice question."
                    .to_owned(),
            );
        }
    }
    Ok(())
}

fn extract_written_denominators(text: &str) -> BTreeSet<i64> {
    extract_fraction_tokens(text)
        .into_iter()
        .filter_map(|token| {
            token
                .literal
                .split_once('/')
                .and_then(|(_, denominator)| denominator.parse::<i64>().ok())
        })
        .collect()
}

fn extract_integers(text: &str) -> BTreeSet<i64> {
    text.split(|character: char| !character.is_ascii_digit())
        .filter(|value| !value.is_empty())
        .filter_map(|value| value.parse::<i64>().ok())
        .collect()
}

fn ordering_direction(question: &str) -> Option<bool> {
    let question = question.to_lowercase();
    if !question.contains("order") && !question.contains("arrange") {
        return None;
    }
    if question.contains("least to greatest") || question.contains("ascending order") {
        Some(true)
    } else if question.contains("greatest to least") || question.contains("descending order") {
        Some(false)
    } else {
        None
    }
}

fn extract_fractions(text: &str) -> Vec<Fraction> {
    extract_fraction_tokens(text)
        .into_iter()
        .map(|fraction| fraction.value)
        .collect()
}

fn extract_fraction_tokens(text: &str) -> Vec<FractionToken> {
    let bytes = text.as_bytes();
    let mut fractions = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if let Some((token, next_index)) = parse_latex_fraction(text, index) {
            fractions.push(token);
            index = next_index;
            continue;
        }
        if !bytes[index].is_ascii_digit() {
            index += 1;
            continue;
        }
        let numerator_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] != b'/' {
            continue;
        }
        let numerator_end = index;
        index += 1;
        let denominator_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if denominator_start == index {
            continue;
        }
        let numerator = text[numerator_start..numerator_end].parse::<i64>();
        let denominator = text[denominator_start..index].parse::<i64>();
        if let (Ok(numerator), Ok(denominator)) = (numerator, denominator) {
            if let Some(fraction) = Fraction::new(numerator, denominator) {
                fractions.push(FractionToken {
                    value: fraction,
                    literal: text[numerator_start..index].to_owned(),
                    span: numerator_start..index,
                });
            }
        }
    }
    fractions
}

fn parse_latex_fraction(text: &str, start: usize) -> Option<(FractionToken, usize)> {
    let bytes = text.as_bytes();
    let fraction_prefix = ["\\frac{", "\\dfrac{", "\\tfrac{"]
        .into_iter()
        .find(|prefix| {
            bytes.get(start..start.saturating_add(prefix.len())) == Some(prefix.as_bytes())
        })?;
    let mut index = start + fraction_prefix.len();
    let numerator_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if numerator_start == index
        || bytes.get(index) != Some(&b'}')
        || bytes.get(index + 1) != Some(&b'{')
    {
        return None;
    }
    let numerator_end = index;
    index += 2;
    let denominator_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if denominator_start == index || bytes.get(index) != Some(&b'}') {
        return None;
    }
    let numerator = text[numerator_start..numerator_end].parse::<i64>().ok()?;
    let denominator = text[denominator_start..index].parse::<i64>().ok()?;
    let value = Fraction::new(numerator, denominator)?;
    Some((
        FractionToken {
            value,
            literal: format!("{numerator}/{denominator}"),
            span: start..index + 1,
        },
        index + 1,
    ))
}

fn greatest_common_divisor(mut left: u64, mut right: u64) -> u64 {
    while right != 0 {
        let remainder = left % right;
        left = right;
        right = remainder;
    }
    left.max(1)
}

/// Sets of fractions the source material already works with, in the order they
/// appear, with repeats and anything the lesson has already modelled removed.
///
/// A small model asked to invent a fresh set of values for every practice task
/// tends to reuse the one it was just shown, so each task is handed its own set
/// from the textbook instead of being asked to think one up.
pub fn unused_source_fraction_sets(
    source_texts: &[String],
    already_used: &[String],
) -> Vec<String> {
    let spent = already_used
        .iter()
        .filter_map(|text| fraction_value_signature(text))
        .collect::<BTreeSet<_>>();

    let mut seen = BTreeSet::new();
    let mut sets = Vec::new();
    for text in source_texts {
        for sentence in text.split(['\n', '.']) {
            let Some(signature) = fraction_value_signature(sentence) else {
                continue;
            };
            if spent.contains(&signature) || !seen.insert(signature.clone()) {
                continue;
            }
            sets.push(signature.replace('|', ", "));
        }
    }
    sets
}

/// Fraction sets to hand practice tasks when the source material cannot supply
/// them, each holding three values a learner can put in order.
///
/// Denominators stay in the range primary work uses and every set has a small
/// enough common denominator to be worked by hand.
const CONSTRUCTED_PRACTICE_SETS: [[(u32, u32); 3]; 6] = [
    [(2, 5), (3, 10), (7, 20)],
    [(3, 8), (5, 12), (7, 24)],
    [(4, 9), (5, 6), (11, 18)],
    [(3, 7), (5, 14), (9, 28)],
    [(5, 9), (2, 3), (13, 18)],
    [(7, 10), (3, 4), (4, 5)],
];

/// One set of values per practice task, taken from the source material where it
/// states any and constructed where it does not.
///
/// The textbook is preferred, because practice then stays in the number range the
/// learners have already met. Sources that explain fractions without stating any
/// leave nothing to mine, and a lesson still needs values, so ordering work falls
/// back to a constructed set. Asking the model to invent one is what fails: it
/// reuses the worked example's numbers and reverses them.
pub fn reserved_practice_value_sets(
    source_texts: &[String],
    already_used: &[String],
    objective_statements: &[String],
) -> Vec<String> {
    let mut sets = unused_source_fraction_sets(source_texts, already_used);
    if !objective_statements
        .iter()
        .any(|statement| requires_fraction_ordering(statement))
    {
        return sets;
    }

    let mut spent = already_used
        .iter()
        .filter_map(|text| fraction_value_signature(text))
        .collect::<BTreeSet<_>>();
    spent.extend(sets.iter().filter_map(|set| fraction_value_signature(set)));

    for candidate in CONSTRUCTED_PRACTICE_SETS {
        if sets.len() >= objective_statements.len() {
            break;
        }
        let text = candidate
            .iter()
            .map(|(numerator, denominator)| format!("{numerator}/{denominator}"))
            .collect::<Vec<_>>()
            .join(", ");
        let Some(signature) = fraction_value_signature(&text) else {
            continue;
        };
        if !spent.insert(signature.clone()) {
            continue;
        }
        sets.push(signature.replace('|', ", "));
    }
    sets
}

/// The fractions in a piece of text, ordered and de-duplicated, as `a/b|c/d`.
/// Unlike the ordering-specific signature this does not require the text to
/// state a direction, so it also reads plain exercise lines.
fn fraction_value_signature(text: &str) -> Option<String> {
    let fractions = extract_fractions(text).into_iter().collect::<BTreeSet<_>>();
    if fractions.len() < 2 {
        return None;
    }
    Some(
        fractions
            .iter()
            .map(|fraction| format!("{}/{}", fraction.numerator, fraction.denominator))
            .collect::<Vec<_>>()
            .join("|"),
    )
}

#[cfg(test)]
mod source_value_tests {
    use super::*;

    #[test]
    fn hands_each_practice_task_its_own_values_from_the_textbook() {
        // The excerpts and worked example from the lesson that failed in the app.
        let sources = vec![
            "Arrange the following fractions in ascending order: 5/6; 7/8; 3/4".to_owned(),
            "Exercise 4.6: Order and compare fractions\n1. Arrange the following fractions in \
             ascending order: 8/9; 11/12; 5/6\n2. Arrange the following fractions in descending \
             order: 5/8; 8/14; 18/28"
                .to_owned(),
        ];
        let already_modelled =
            vec!["Arrange the following fractions in ascending order: 5/6; 7/8; 3/4".to_owned()];

        let sets = unused_source_fraction_sets(&sources, &already_modelled);

        assert!(
            !sets.iter().any(|set| set.contains("7/8")),
            "the worked example's own values must not be offered again: {sets:?}",
        );
        assert!(
            sets.len() >= 2,
            "two practice tasks need two sets, got {sets:?}"
        );
        assert_ne!(sets[0], sets[1], "each task needs different values");
    }

    #[test]
    fn offers_nothing_when_the_lesson_is_not_about_fractions() {
        let sources = vec!["Learners name the parts of a plant and describe each one.".to_owned()];
        assert!(unused_source_fraction_sets(&sources, &[]).is_empty());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reading more questions is only worth anything if a wrong answer still
    /// comes back wrong. These are the shapes the lesson actually uses.
    #[test]
    fn a_wrong_comparison_or_ordering_answer_is_caught() {
        assert!(check_fraction_answer("Which is greater: 3/8 or 5/8?", "3/8").is_wrong());
        assert!(
            check_fraction_answer("Which is smaller: 2/5 or 3/5?", "3/5").is_wrong(),
            "a question asking for the lesser must not accept the greater",
        );
        assert!(
            check_fraction_answer("Order 1/3, 3/5 and 1/2.", "1/3 < 3/5 < 1/2").is_wrong(),
            "an answer that states its own direction is held to it",
        );
    }

    /// The shapes in graspy's own reference lesson, which went unread before.
    #[test]
    fn the_answers_the_reference_lesson_writes_are_read() {
        for (question, answer) in [
            ("Which is greater: 3/8 or 5/8?", "5/8"),
            ("Which is greater on a number line: 2/5 or 3/5?", "3/5"),
            (
                "Which is greater: 3/8 or 5/8? Explain.",
                "5/8 because equal eighths are compared by their numerators.",
            ),
            ("Order 1/3, 3/5 and 1/2.", "1/3 < 1/2 < 3/5"),
        ] {
            assert_eq!(
                check_fraction_answer(question, answer),
                AnswerCheck::Correct,
                "{question}",
            );
        }
    }

    /// Everything graspy teaches that is not fraction ordering reaches this
    /// checker: counting in millions, lowest common multiples, plane shapes.
    /// It cannot read any of them, and the whole point of saying so is that a
    /// wrong answer and an unread one used to come back the same.
    #[test]
    fn an_answer_no_checker_reads_is_not_reported_as_correct() {
        for (question, answer) in [
            ("What is the lowest common multiple of 4 and 6?", "24"),
            ("Write the number 1,000,000 in words.", "One thousand"),
            ("How many faces does a cube have?", "12"),
        ] {
            assert_eq!(
                check_fraction_answer(question, answer),
                AnswerCheck::Unchecked,
                "{question}",
            );
        }
    }

    #[test]
    fn accepts_the_requested_fractions_in_ascending_order() {
        assert_eq!(
            check_fraction_answer(
            "Order 1/3, 1/4, and 1/6 from least to greatest.",
            "Using twelfths gives 4/12, 3/12, and 2/12. Therefore: 1/6, 1/4, 1/3."
        ),
            AnswerCheck::Correct,
        );
    }

    #[test]
    fn rejects_an_incorrect_order() {
        assert!(check_fraction_answer(
            "Order 1/3, 1/4, and 1/6 from least to greatest.",
            "1/6, 1/3, 1/4"
        )
        .is_wrong());
    }

    #[test]
    fn rejects_an_answer_to_a_different_question() {
        assert!(check_fraction_answer(
            "Order 1/3, 1/6, and 1/2 from least to greatest.",
            "1/8, 1/4, and 1/2"
        )
        .is_wrong());
    }

    #[test]
    fn a_question_outside_fraction_ordering_is_left_unchecked() {
        assert_eq!(
            check_fraction_answer(
                "Explain what a denominator represents.",
                "It describes the number of equal parts in the whole.",
            ),
            AnswerCheck::Unchecked,
        );
    }

    #[test]
    fn calculates_a_canonical_ordering_answer() {
        assert_eq!(
            canonical_fraction_answer("Order 1/3, 1/4, and 1/6 from least to greatest."),
            Some("1/6 < 1/4 < 1/3".to_owned())
        );
    }

    #[test]
    fn understands_curriculum_wording_for_ascending_and_descending_order() {
        assert_eq!(
            canonical_fraction_answer("Arrange 8/9, 11/12 and 5/6 in ascending order."),
            Some("5/6 < 8/9 < 11/12".to_owned())
        );
        assert_eq!(
            canonical_fraction_answer("Arrange 5/8, 8/14 and 18/28 in descending order."),
            Some("18/28 > 5/8 > 8/14".to_owned())
        );
    }

    #[test]
    fn calculates_canonical_answers_from_latex_fraction_notation() {
        assert_eq!(
            canonical_fraction_answer(
                r"Arrange $\frac{5}{6}; \frac{7}{8}; \frac{3}{4}$ in ascending order."
            ),
            Some("3/4 < 5/6 < 7/8".to_owned())
        );
        assert_eq!(
            check_fraction_answer(
            r"Arrange $\frac{5}{8}; \frac{8}{14}; \frac{18}{28}$ in descending order.",
            r"$\frac{18}{28}; \frac{5}{8}; \frac{8}{14}$"
        ),
            AnswerCheck::Correct,
        );
    }

    #[test]
    fn calculates_a_canonical_comparison_answer() {
        assert_eq!(
            canonical_fraction_answer("Compare 1/2 and 3/4 on a number line."),
            Some("3/4 > 1/2".to_owned())
        );
    }

    #[test]
    fn answers_a_comparison_of_equivalent_fractions_as_an_equality() {
        assert_eq!(
            canonical_fraction_answer(
                "Compare the following two fractions using a common representation (e.g., a \
                 number line or by finding a common denominator). Show your steps:\n\n1/2 ≈ ≈ 2/4"
            ),
            Some("1/2 = 2/4".to_owned())
        );
    }

    #[test]
    fn keeps_the_written_order_when_a_comparison_is_an_equality() {
        assert_eq!(
            canonical_fraction_answer("Compare 6/8 and 3/4."),
            Some("6/8 = 3/4".to_owned())
        );
    }

    #[test]
    fn reads_a_comparison_written_in_latex_fraction_notation() {
        assert_eq!(
            canonical_fraction_answer(r"Compare $\frac{2}{6}$ and $\frac{1}{3}$."),
            Some("2/6 = 1/3".to_owned())
        );
    }

    #[test]
    fn declines_to_answer_a_comparison_that_names_one_fraction() {
        assert_eq!(canonical_fraction_answer("Compare 1/2 to a whole."), None);
    }

    #[test]
    fn declines_to_answer_a_comparison_that_names_more_than_two_fractions() {
        assert_eq!(canonical_fraction_answer("Compare 1/2, 1/3 and 1/4."), None);
    }

    #[test]
    fn leaves_questions_that_ask_for_no_comparison_alone() {
        assert_eq!(
            canonical_fraction_answer("Add 1/2 and 1/4, then simplify your answer."),
            None
        );
    }

    #[test]
    fn rejects_an_expected_answer_that_states_a_fraction_the_question_never_asks_about() {
        assert_eq!(
            validate_answer_fraction_provenance(
                "Compare the following two fractions using a common representation (e.g., a \
                 number line or by finding a common denominator). Show your steps:\n\n1/2 ≈ ≈ 2/4",
                "1/2 > 1/4",
            ),
            Err(
                "The expected answer states 1/4, which its question does not ask about.".to_owned()
            )
        );
    }

    #[test]
    fn accepts_an_expected_answer_that_rewrites_the_stated_fractions_over_a_common_denominator() {
        assert!(validate_answer_fraction_provenance(
            "Order 1/3, 1/4, and 1/6 from least to greatest.",
            "Using twelfths gives 4/12, 3/12, and 2/12. Therefore: 1/6, 1/4, 1/3.",
        )
        .is_ok());
    }

    #[test]
    fn catches_an_invented_value_in_a_comparison_the_lesson_cannot_answer_itself() {
        assert_eq!(
            validate_answer_fraction_provenance(
                "Compare 1/2, 1/3 and 1/4.",
                "1/5 is the smallest."
            ),
            Err(
                "The expected answer states 1/5, which its question does not ask about.".to_owned()
            )
        );
    }

    #[test]
    fn catches_an_invented_value_in_an_ordering_question_that_never_says_fraction() {
        assert_eq!(
            validate_answer_fraction_provenance(
                "Order 1/3, 1/4, and 1/6 from least to greatest.",
                "1/8 < 1/4 < 1/3",
            ),
            Err(
                "The expected answer states 1/8, which its question does not ask about.".to_owned()
            )
        );
    }

    #[test]
    fn leaves_a_calculated_answer_alone() {
        assert!(validate_answer_fraction_provenance(
            "A recipe uses 3/4 of a cup of flour. How much is left from a full cup?",
            "1/4 of a cup remains.",
        )
        .is_ok());
    }

    #[test]
    fn leaves_a_comparison_that_states_no_fractions_alone() {
        assert!(validate_answer_fraction_provenance(
            "Compare two fractions of your own choosing and explain which is greater.",
            "Answers vary, for example 1/2 > 1/3.",
        )
        .is_ok());
    }

    #[test]
    fn rejects_prerequisite_only_practice_for_a_fraction_ordering_objective() {
        assert_eq!(
            validate_fraction_ordering_practice(
                "Arrange fractions in ascending order.",
                &["Arrange 3/4, 5/6 and 7/8 in ascending order."],
                "Find the LCM of the denominators 6, 8, and 4.",
                "The LCM is 24.",
            ),
            Err(
                "Practice for a fraction-ordering objective must ask learners to order fractions in a stated direction."
                    .to_owned()
            )
        );
    }

    #[test]
    fn accepts_correct_fraction_ordering_practice_with_fresh_values() {
        assert!(validate_fraction_ordering_practice(
            "Arrange fractions in ascending order.",
            &["Arrange 3/4, 5/6 and 7/8 in ascending order."],
            "Arrange 2/3, 3/5 and 7/10 in ascending order.",
            "3/5 < 2/3 < 7/10",
        )
        .is_ok());
    }

    #[test]
    fn rejects_practice_that_repeats_the_worked_example_values() {
        assert_eq!(
            validate_fraction_ordering_practice(
                "Order three fractions from least to greatest.",
                &["Arrange 3/4, 5/6 and 7/8 in ascending order."],
                "Arrange 7/8, 3/4 and 5/6 in ascending order.",
                "3/4 < 5/6 < 7/8",
            ),
            Err(
                "Fraction-ordering practice must use different values from the worked example."
                    .to_owned()
            )
        );
    }

    #[test]
    fn rejects_practice_in_a_different_direction_from_the_objective() {
        assert_eq!(
            validate_fraction_ordering_practice(
                "Arrange fractions in ascending order.",
                &[],
                "Arrange 2/3, 3/5 and 7/10 in descending order.",
                "7/10 > 2/3 > 3/5",
            ),
            Err(
                "Practice must use the ordering direction stated by the lesson objective."
                    .to_owned()
            )
        );
    }

    #[test]
    fn identifies_reordered_equivalent_fraction_sets_as_the_same_values() {
        assert_eq!(
            fraction_ordering_value_set_signature("Arrange 1/2, 3/5 and 2/3 in ascending order."),
            fraction_ordering_value_set_signature(
                "Arrange 4/6, 5/10 and 6/10 in descending order."
            )
        );
    }

    #[test]
    fn distinguishes_ascending_and_descending_tasks() {
        assert!(has_same_fraction_ordering_direction(
            "Arrange fractions in ascending order.",
            "Arrange 1/3, 1/2 and 3/4 in ascending order."
        ));
        assert!(!has_same_fraction_ordering_direction(
            "Arrange fractions in ascending order.",
            "Arrange 1/3, 1/2 and 3/4 in descending order."
        ));
    }

    #[test]
    fn rejects_a_hint_with_denominators_from_a_different_problem() {
        assert_eq!(
            validate_fraction_ordering_hints(
                "Arrange 1/3, 5/6 and 2/3 in ascending order.",
                &["Find the LCM of the denominators (6, 8, 4).".to_owned()],
            ),
            Err(
                "A fraction-ordering hint names denominators that do not match its practice question."
                    .to_owned()
            )
        );
    }

    #[test]
    fn accepts_a_hint_with_the_practice_questions_denominators() {
        assert!(validate_fraction_ordering_hints(
            "Arrange 1/4, 3/8 and 5/12 in descending order.",
            &["Find the LCM of the denominators (4, 8, 12).".to_owned()],
        )
        .is_ok());
    }

    #[test]
    fn creates_direction_safe_hints_for_reviewed_fraction_practice() {
        let hints =
            fraction_ordering_practice_hints("Arrange 5/8, 8/14 and 18/28 in descending order.")
                .expect("fraction-ordering hints");

        assert_eq!(hints.len(), 3);
        assert!(hints[2].contains("largest to smallest"));
        validate_fraction_ordering_hints(
            "Arrange 5/8, 8/14 and 18/28 in descending order.",
            &hints,
        )
        .expect("aligned hints");
    }

    #[test]
    fn rejects_the_doubled_relation_symbol_a_local_run_produced() {
        assert_eq!(
            validate_lesson_question_text(
                "Compare the following two fractions using a common representation (e.g., a \
                 number line or by finding a common denominator). Show your steps:\n\n1/2 ≈ ≈ 2/4"
            ),
            Err("The question writes \"≈ ≈\" with nothing between the two symbols.".to_owned())
        );
    }

    #[test]
    fn rejects_a_doubled_comparison_symbol() {
        assert_eq!(
            validate_lesson_question_text("Which fraction is greater: 3/5 > > 2/5?"),
            Err("The question writes \"> >\" with nothing between the two symbols.".to_owned())
        );
    }

    #[test]
    fn rejects_a_doubled_less_than_symbol() {
        assert_eq!(
            validate_lesson_question_text("Order 1/4 and 1/3 from least to greatest: 1/4 < < 1/3"),
            Err("The question writes \"< <\" with nothing between the two symbols.".to_owned())
        );
    }

    #[test]
    fn rejects_a_doubled_equals_symbol() {
        assert_eq!(
            validate_lesson_question_text("Compare 1/2 and 2/4. Complete: 1/2 = = 2/4"),
            Err("The question writes \"= =\" with nothing between the two symbols.".to_owned())
        );
    }

    #[test]
    fn rejects_a_question_that_ends_on_a_relation_symbol() {
        assert_eq!(
            validate_lesson_question_text("Compare 1/2 and 2/4. Show your steps:\n\n1/2 ="),
            Err("The question ends with \"=\" and never states what is being related.".to_owned())
        );
    }

    #[test]
    fn rejects_a_comparison_that_states_the_relation_it_asks_for() {
        assert_eq!(
            validate_lesson_question_text("Compare 1/2 < 3/4 and show your steps."),
            Err(
                "The question states \"1/2 < 3/4\", which is what it asks the learner to work out."
                    .to_owned()
            )
        );
    }

    #[test]
    fn rejects_a_stated_relation_between_fractions_written_in_latex() {
        assert_eq!(
            validate_lesson_question_text("Compare \\frac{1}{2} = \\frac{2}{4}."),
            Err(
                "The question states \"1/2 = 2/4\", which is what it asks the learner to work out."
                    .to_owned()
            )
        );
    }

    #[test]
    fn accepts_a_comparison_that_names_its_fractions_without_relating_them() {
        assert!(validate_lesson_question_text(
            "Compare the following two fractions using a common representation (e.g., a number \
             line or by finding a common denominator). Show your steps:\n\n1/2 and 2/4"
        )
        .is_ok());
    }

    #[test]
    fn accepts_fractions_written_in_latex() {
        assert!(validate_lesson_question_text(
            "Compare \\frac{1}{2} and \\frac{2}{4}. Show your steps."
        )
        .is_ok());
    }

    #[test]
    fn accepts_a_semicolon_separated_list_of_fractions() {
        assert!(validate_lesson_question_text(
            "Order these fractions from least to greatest: 1/3; 1/4; 1/6."
        )
        .is_ok());
    }

    #[test]
    fn accepts_an_equals_sign_that_defines_a_value() {
        assert!(validate_lesson_question_text(
            "Given that 1 whole = 4 quarters, compare 3/4 and 1/2. Show your steps."
        )
        .is_ok());
    }

    #[test]
    fn reads_a_two_character_relation_symbol_whole() {
        assert!(validate_lesson_question_text(
            "For a class where every share x <= 1 whole, compare 3/8 and 1/4."
        )
        .is_ok());
    }

    #[test]
    fn leaves_a_question_that_relates_no_fractions_alone() {
        assert!(validate_lesson_question_text(
            "A recipe uses 3/4 of a cup of flour. How much is left from a full cup?"
        )
        .is_ok());
    }
}
