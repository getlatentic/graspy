//! How a prepared lesson reads to the teacher who opens it.
//!
//! A lesson is written once and read many times, so every idea in it must
//! appear once. Two failures break that, and neither is a matter of taste:
//! prose that describes its own construction instead of teaching, and a
//! practice question that is the worked example a learner has just been shown
//! the answer to.
//!
//! Both are checked rather than merely asked for. The instructions already
//! forbid them; a model that is told and not held to it writes them anyway,
//! and a repair told exactly which sentence broke which rule can fix it.

/// Planning words that belong to graspy's own bookkeeping, never to a lesson.
///
/// `procedure` and `representation` are the knowledge types the plan carries
/// internally; a step whose prose opens with one of them as a label is reciting
/// its own schema.
const PLANNING_LABELS: [&str; 2] = ["procedure:", "representation:"];

/// Rejects explanation prose that narrates the plan instead of teaching.
///
/// The rule is the instruction the node is already given, enforced: teach the
/// idea to a learner, without restating the objective, announcing the step's
/// own purpose, naming the knowledge component, or prefixing prose with a
/// planning label.
pub fn reject_generation_narration(text: &str) -> Result<(), String> {
    let lowered = text.trim().to_lowercase();

    if let Some(label) = PLANNING_LABELS
        .iter()
        .find(|label| lowered.starts_with(*label))
    {
        return Err(format!(
            "An explanation opens with the planning label \"{}\". Delete the label and teach the idea straight to a learner.",
            label.trim_end_matches(':'),
        ));
    }
    if lowered.contains("knowledge component") {
        return Err(
            "An explanation names the lesson's internal planning vocabulary. Teach the idea to a learner in plain words, without mentioning the knowledge component or the plan."
                .to_owned(),
        );
    }
    if lowered.contains("lesson objective") || names_an_objective_by_position(&lowered) {
        return Err(
            "An explanation refers to a learning goal by its place in the plan. A learner never sees that list — teach what the goal is about instead of announcing which one it is."
                .to_owned(),
        );
    }
    if lowered.contains("this step") {
        return Err(
            "An explanation announces the step's own purpose. A teacher reading the lesson can see which step this is — use the words to teach the idea instead."
                .to_owned(),
        );
    }
    Ok(())
}

/// "the first objective", "the second objective" — the plan's ordering read
/// back as prose.
fn names_an_objective_by_position(lowered: &str) -> bool {
    const POSITIONS: [&str; 8] = [
        "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
    ];
    POSITIONS
        .iter()
        .any(|position| lowered.contains(&format!("{position} objective")))
}

/// Rejects a practice question that is the worked example already answered in
/// front of the class.
///
/// Practice is where a learner does the work themselves. Handing back the
/// problem they have just watched being solved gives a teacher nothing to set,
/// and it is the single most common way a prepared lesson reads twice.
///
/// Comparison ignores case, spacing and closing punctuation, because the same
/// question retyped with a full stop is still the same question.
pub fn reject_practice_repeating_example(
    question: &str,
    worked_example_problems: &[&str],
) -> Result<(), String> {
    if !repeats_a_worked_example(question, worked_example_problems) {
        return Ok(());
    }
    Err(
        "This practice question repeats the worked example a learner has just been shown the answer to. Set a different task for the same skill — keep what is being practised and change what is being worked on."
            .to_owned(),
    )
}

/// Rejects an explanation that hands back the worked example standing beside
/// it.
///
/// An explanation teaches the idea so the example that follows makes sense.
/// One that states the example's own task instead says nothing the example is
/// not about to say, and the step reads twice before a learner has done
/// anything.
pub fn reject_explanation_echoing_example(
    explanation: &str,
    worked_example_problems: &[&str],
) -> Result<(), String> {
    if !repeats_a_worked_example(explanation, worked_example_problems) {
        return Ok(());
    }
    Err(
        "An explanation restates the worked example standing beside it. Use the explanation to teach why the method works, and leave the task itself to the example."
            .to_owned(),
    )
}

/// Whether a block hands back a worked example's task — as the whole of what it
/// says, or as the sentence it opens with before adding the answer.
fn repeats_a_worked_example(text: &str, worked_example_problems: &[&str]) -> bool {
    let written = comparable(text);
    if written.is_empty() {
        return false;
    }
    worked_example_problems
        .iter()
        .map(|problem| comparable(problem))
        .filter(|problem| !problem.is_empty())
        .any(|problem| written == problem || written.starts_with(&format!("{problem}.")))
}

/// The same sentence typed twice is the same sentence: case, run-together
/// spacing and a trailing full stop do not make it a new question.
fn comparable(text: &str) -> String {
    text.trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches(['.', '!', '?', ' '])
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prose_that_teaches_is_accepted() {
        for explanation in [
            "Numbers this large are read in groups of three digits, counting from the right.",
            "A million is a thousand thousands. Writing it out gives 1 000 000.",
            "When you count forward in millions, only the millions digit changes.",
            "The procedure works because each group of three digits has its own name.",
        ] {
            assert!(
                reject_generation_narration(explanation).is_ok(),
                "prose spoken to a learner is accepted: {explanation}",
            );
        }
    }

    #[test]
    fn prose_that_describes_its_own_construction_is_rejected() {
        // Every one of these was written by the shipped model into a real
        // prepared lesson, in the same six-step plan.
        for narration in [
            "This step focuses on the first objective: counting in millions.",
            "Procedure: Start at a given number and count forward by one million.",
            "Representation: List the resulting numbers in millions.",
            "The core action is to use place-value patterns, as suggested by the knowledge component 'Count forward in millions'.",
            "This lesson objective asks learners to write numbers in millions.",
        ] {
            assert!(
                reject_generation_narration(narration).is_err(),
                "narration is rejected: {narration}",
            );
        }
    }

    #[test]
    fn a_practice_question_may_not_be_the_worked_example_again() {
        let example = "Count from 1 million to 5 million in millions. Write down the numbers as digits only and include their full names.";

        assert!(
            reject_practice_repeating_example(example, &[example]).is_err(),
            "the byte-identical repeat the model actually produced is rejected",
        );
        assert!(
            reject_practice_repeating_example(
                "  count from 1 MILLION to 5 million in millions. write down the numbers as digits only and include their full names  ",
                &[example],
            )
            .is_err(),
            "retyping it with different case, spacing and punctuation is still the same question",
        );
    }

    #[test]
    fn an_explanation_may_not_hand_back_the_example_beside_it() {
        let problem = "Count from 2 million to 5 million by adding one million each time.";
        // Written by the shipped model into the replayed lesson: the example's
        // own task, then its answer, standing where the teaching should be.
        assert!(
            reject_explanation_echoing_example(
                "Count from 2 million to 5 million by adding one million each time. The sequence is 2 million, 3 million, 4 million, and 5 million.",
                &[problem],
            )
            .is_err(),
            "an explanation that opens with the example's task is rejected",
        );
        assert!(
            reject_explanation_echoing_example(
                "When we count in millions, we use the million place value as our counting unit.",
                &[problem],
            )
            .is_ok(),
            "prose that teaches why the method works is accepted",
        );
    }

    #[test]
    fn practice_on_the_same_skill_with_different_work_is_accepted() {
        let example = "Count from 1 million to 5 million in millions.";
        for question in [
            "Count from 6 million to 10 million in millions.",
            "Count from 2 billion to 6 billion in billions.",
            "Write 4 000 000 in millions.",
        ] {
            assert!(
                reject_practice_repeating_example(question, &[example]).is_ok(),
                "a new task for the same skill is accepted: {question}",
            );
        }
        assert!(
            reject_practice_repeating_example("Anything at all", &[]).is_ok(),
            "a step with no worked example has nothing to repeat",
        );
    }
}
