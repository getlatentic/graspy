//! How the assessment stage breaks into calls and reassembles.
//!
//! One call per source record, each paired with the learning goal its question
//! is counted towards. The pairing is decided here, deterministically, because
//! both ends of it failed when left open: calls left to choose their own goal
//! mostly chose the first two and left the rest uncovered, and records dealt to
//! goals blind to content put ascending questions under descending goals —
//! which `complete-reviewed-practice` then splices into the wrong practice
//! step, five runs out of five.

use super::deterministic_fault;
use crate::generation_program::domain::RuntimeFault;
use crate::lesson_planning::mathematics::{
    conflicting_fraction_ordering_directions, has_same_fraction_ordering_direction,
};
use serde_json::{json, Value};

/// One planned call: which record it carries and the real sequence of the goal
/// its answer is stamped with on assembly.
struct PairedCall {
    record_index: usize,
    goal_sequence: u64,
}

/// The calls the assessment stage is broken into.
///
/// The record decides how many calls there are and what each one costs, because
/// the stage writes an assessment for every record carrying an exercise.
/// Narrowing the records is the point rather than a side effect: the evidence
/// snapshot was 8,698 of the 17,598 characters each call carried; one record is
/// a few hundred, which is what leaves room in the window to write into.
///
/// A call is shown its paired goal alone, renumbered as 1. A call shown a
/// single goal numbers its answer 1 whatever the goal's real sequence is, and
/// the per-item check rejects an answer naming a goal the call was not shown.
/// [`collect_assessment_items`] restores the real sequence from the same
/// pairing.
pub(super) fn plan_assessment_items(input: &Value) -> Result<Vec<Value>, RuntimeFault> {
    let records = source_records(input)?;
    let calls = paired_calls(input)?;
    Ok(calls
        .iter()
        .map(|call| {
            let mut lesson = input.get("lesson").cloned().unwrap_or(Value::Null);
            if let Some(snapshot) = lesson.pointer_mut("/sourceEvidenceSnapshot/records") {
                *snapshot = Value::Array(vec![records[call.record_index].clone()]);
            }
            let mut objective_plan = input.get("objectivePlan").cloned().unwrap_or(Value::Null);
            if let Some(shown) = objective_plan.pointer_mut("/lessonObjectives") {
                let mut paired_goal = shown
                    .as_array()
                    .and_then(|goals| {
                        goals.iter().find(|goal| {
                            goal.get("sequence").and_then(Value::as_u64) == Some(call.goal_sequence)
                        })
                    })
                    .cloned()
                    .unwrap_or(Value::Null);
                paired_goal["sequence"] = json!(1);
                *shown = Value::Array(vec![paired_goal]);
            }
            json!({
                "lesson": lesson,
                "knowledgePlan": input.get("knowledgePlan").cloned().unwrap_or(Value::Null),
                "objectivePlan": objective_plan,
            })
        })
        .collect())
}

/// The stage's plan, assembled from what each call wrote.
///
/// Every call answered against its goal renumbered as 1, so each question is
/// stamped with the paired goal's real sequence as it is joined in. The pairing
/// is recomputed from the same input the planner worked from; `written` arrives
/// in planning order, one plan per call.
pub(super) fn collect_assessment_items(
    input: &Value,
    written: Vec<Value>,
) -> Result<Value, RuntimeFault> {
    let calls = paired_calls(input)?;
    if calls.len() != written.len() {
        return Err(deterministic_fault(vec![format!(
            "The assessment stage planned {} calls but {} answers came back.",
            calls.len(),
            written.len(),
        )]));
    }
    let mut assessments = Vec::new();
    for (call, plan) in calls.iter().zip(&written) {
        let items = plan
            .get("assessments")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                deterministic_fault(vec![
                    "A call in the assessment stage answered without any assessments.".to_owned(),
                ])
            })?;
        for item in items {
            let mut stamped = item.clone();
            stamped["lessonObjectiveSequence"] = json!(call.goal_sequence);
            assessments.push(stamped);
        }
    }
    Ok(json!({ "assessments": assessments }))
}

/// Which record serves which goal, in call order.
///
/// Every goal must end up with at least one record, and no record may serve a
/// goal whose stated ordering direction its own content contradicts — that
/// contradiction is exactly what the practice completion later refuses. Records
/// beyond the covering set go to the compatible goal with the fewest so far,
/// and a record that contradicts every goal plans no call at all: any question
/// it yielded would be counted towards a goal it argues against.
fn paired_calls(input: &Value) -> Result<Vec<PairedCall>, RuntimeFault> {
    let records = source_records(input)?;
    let goals = lesson_goals(input)?;
    let record_texts: Vec<String> = records.iter().map(record_text).collect();
    let goal_statements: Vec<&str> = goals
        .iter()
        .map(|goal| goal.get("statement").and_then(Value::as_str).unwrap_or(""))
        .collect();
    let goal_sequences = goals
        .iter()
        .map(|goal| {
            goal.get("sequence").and_then(Value::as_u64).ok_or_else(|| {
                deterministic_fault(vec![
                    "A learning goal in the assessment stage's input carries no sequence number."
                        .to_owned(),
                ])
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    let compatible = compatibility(&record_texts, &goal_statements);
    let mut serving_goal = cover_every_goal(&compatible, records.len()).map_err(|goal_index| {
        deterministic_fault(vec![format!(
            "Learning goal {} (\"{}\") has no source material a question can be drawn from. Add source material that supports this goal.",
            goal_sequences[goal_index], goal_statements[goal_index],
        )])
    })?;

    let mut load = vec![0usize; goals.len()];
    for assignment in serving_goal.iter().flatten() {
        load[*assignment] += 1;
    }
    for (record_index, assignment) in serving_goal.iter_mut().enumerate() {
        if assignment.is_some() {
            continue;
        }
        *assignment = (0..goals.len())
            .filter(|&goal_index| compatible[goal_index].contains(&record_index))
            .min_by_key(|&goal_index| (load[goal_index], goal_index));
        if let Some(goal_index) = *assignment {
            load[goal_index] += 1;
        }
    }

    Ok(serving_goal
        .iter()
        .enumerate()
        .filter_map(|(record_index, assignment)| {
            assignment.map(|goal_index| PairedCall {
                record_index,
                goal_sequence: goal_sequences[goal_index],
            })
        })
        .collect())
}

/// Which records each goal may draw from, exact direction matches first so the
/// covering pass reaches for them before spending a direction-free record.
fn compatibility(record_texts: &[String], goal_statements: &[&str]) -> Vec<Vec<usize>> {
    goal_statements
        .iter()
        .map(|statement| {
            let exact = record_texts
                .iter()
                .enumerate()
                .filter(|(_, text)| has_same_fraction_ordering_direction(text, statement))
                .map(|(index, _)| index);
            let workable = record_texts
                .iter()
                .enumerate()
                .filter(|(_, text)| {
                    !has_same_fraction_ordering_direction(text, statement)
                        && !conflicting_fraction_ordering_directions(text, statement)
                })
                .map(|(index, _)| index);
            exact.chain(workable).collect()
        })
        .collect()
}

/// Kuhn's maximum bipartite matching: each goal claims a compatible record,
/// displacing an earlier claim only when the displaced goal can re-match
/// elsewhere. A first-fit pass cannot do this — it strands a goal whenever an
/// earlier goal took the one record the later goal could have used — and a
/// stranded goal here means telling a teacher to add an instructional material they already
/// supplied.
///
/// Returns, per record, the goal it covers, or the first goal no assignment can
/// cover.
fn cover_every_goal(
    compatible: &[Vec<usize>],
    record_count: usize,
) -> Result<Vec<Option<usize>>, usize> {
    fn claim(
        goal: usize,
        compatible: &[Vec<usize>],
        visited: &mut [bool],
        owner: &mut [Option<usize>],
    ) -> bool {
        // An unclaimed record first: displacing an earlier goal when a free
        // record would do reshuffles every pairing after it for nothing.
        for &record in &compatible[goal] {
            if !visited[record] && owner[record].is_none() {
                visited[record] = true;
                owner[record] = Some(goal);
                return true;
            }
        }
        for &record in &compatible[goal] {
            if !visited[record] {
                visited[record] = true;
                if owner[record].is_none_or(|holder| claim(holder, compatible, visited, owner)) {
                    owner[record] = Some(goal);
                    return true;
                }
            }
        }
        false
    }

    let mut owner = vec![None; record_count];
    for goal in 0..compatible.len() {
        let mut visited = vec![false; record_count];
        if !claim(goal, compatible, &mut visited, &mut owner) {
            return Err(goal);
        }
    }
    Ok(owner)
}

fn source_records(input: &Value) -> Result<&Vec<Value>, RuntimeFault> {
    input
        .pointer("/lesson/sourceEvidenceSnapshot/records")
        .and_then(Value::as_array)
        .filter(|records| !records.is_empty())
        .ok_or_else(|| {
            deterministic_fault(vec![
                "The assessment stage was given no source records to write questions from."
                    .to_owned(),
            ])
        })
}

fn lesson_goals(input: &Value) -> Result<&Vec<Value>, RuntimeFault> {
    input
        .pointer("/objectivePlan/lessonObjectives")
        .and_then(Value::as_array)
        .filter(|goals| !goals.is_empty())
        .ok_or_else(|| {
            deterministic_fault(vec![
                "The assessment stage was given no learning goals to write questions for."
                    .to_owned(),
            ])
        })
}

/// A record states its direction wherever it states it; the title and the
/// excerpt are both the teacher's material.
fn record_text(record: &Value) -> String {
    ["title", "excerpt"]
        .iter()
        .filter_map(|field| record.get(*field).and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn lesson(record_excerpts: &[&str], goal_statements: &[&str]) -> Value {
        json!({
            "lesson": {
                "topic": "Ordering Fractions",
                "sourceEvidenceSnapshot": {
                    "records": record_excerpts
                        .iter()
                        .enumerate()
                        .map(|(index, excerpt)| {
                            json!({"recordId": format!("r{index}"), "excerpt": excerpt})
                        })
                        .collect::<Vec<_>>(),
                },
                "curriculumSnapshot": {"knowledgeComponents": []},
            },
            "knowledgePlan": {"objectiveKnowledge": []},
            "objectivePlan": {
                "lessonObjectives": goal_statements
                    .iter()
                    .enumerate()
                    .map(|(index, statement)| {
                        json!({"sequence": index + 1, "statement": statement})
                    })
                    .collect::<Vec<_>>(),
            },
        })
    }

    fn wide(record_count: usize) -> Value {
        let excerpts = vec!["x"; record_count]
            .iter()
            .map(|_| "x".repeat(700))
            .collect::<Vec<_>>();
        lesson(
            &excerpts.iter().map(String::as_str).collect::<Vec<_>>(),
            &["first", "second"],
        )
    }

    #[test]
    fn one_call_is_planned_for_each_source_record() {
        assert_eq!(plan_assessment_items(&wide(12)).expect("items").len(), 12);
    }

    /// The whole point: a call carries its own record, not all of them. The
    /// evidence snapshot was half the prompt and the reason one call could not
    /// fit.
    #[test]
    fn a_call_carries_only_its_own_record() {
        let items = plan_assessment_items(&wide(12)).expect("items");
        for (index, item) in items.iter().enumerate() {
            let records = item
                .pointer("/lesson/sourceEvidenceSnapshot/records")
                .and_then(Value::as_array)
                .expect("records");
            assert_eq!(
                records.len(),
                1,
                "call {index} carries more than its record"
            );
            assert_eq!(records[0]["recordId"], format!("r{index}"));
        }
    }

    /// A call shown a single goal numbers its answer 1 whatever the goal's real
    /// sequence is, so it is shown exactly that — the real sequence is restored
    /// on assembly.
    #[test]
    fn a_call_is_shown_its_paired_goal_alone_renumbered_as_one() {
        for item in
            plan_assessment_items(&lesson(&["a", "b", "c"], &["first", "second"])).expect("items")
        {
            let shown = item
                .pointer("/objectivePlan/lessonObjectives")
                .and_then(Value::as_array)
                .expect("goals");
            assert_eq!(shown.len(), 1);
            assert_eq!(shown[0]["sequence"], 1);
        }
    }

    /// The failure the pairing exists for: calls left to choose their own goal
    /// mostly chose the first two, and an unchosen goal failed the assembled
    /// plan's coverage check.
    #[test]
    fn every_goal_is_served_and_extra_records_spread_across_goals() {
        let input = lesson(&["a", "b", "c"], &["first", "second"]);
        let items = plan_assessment_items(&input).expect("items");
        let statements: Vec<&str> = items
            .iter()
            .map(|item| {
                item.pointer("/objectivePlan/lessonObjectives/0/statement")
                    .and_then(Value::as_str)
                    .expect("statement")
            })
            .collect();
        assert_eq!(statements, ["first", "second", "first"]);
    }

    /// The failure the direction rule exists for: an ascending exercise counted
    /// towards a descending goal is spliced into the descending practice step,
    /// and the practice check refuses the whole lesson — five runs out of five.
    #[test]
    fn a_record_stating_a_direction_serves_the_goal_stating_the_same_one() {
        let input = lesson(
            &[
                "Exercise: arrange 1/2, 1/3 in descending order.",
                "Exercise: arrange 2/5, 3/5 in ascending order.",
            ],
            &[
                "Order fractions in ascending order",
                "Order fractions in descending order",
            ],
        );
        let items = plan_assessment_items(&input).expect("items");
        let statements: Vec<&str> = items
            .iter()
            .map(|item| {
                item.pointer("/objectivePlan/lessonObjectives/0/statement")
                    .and_then(Value::as_str)
                    .expect("statement")
            })
            .collect();
        assert_eq!(
            statements,
            [
                "Order fractions in descending order",
                "Order fractions in ascending order",
            ],
        );
    }

    /// First-fit would hand the direction-free record to the direction-free
    /// goal and strand the ascending goal with a descending record. Matching
    /// re-assigns until every goal is covered.
    #[test]
    fn coverage_is_found_even_when_the_first_fit_would_strand_a_goal() {
        let input = lesson(
            &[
                "Exercise: arrange 1/2, 1/3 in ascending order.",
                "Exercise: arrange 2/5, 3/5 in descending order.",
            ],
            &[
                "Recognise fractions in everyday shapes",
                "Order fractions in ascending order",
            ],
        );
        let items = plan_assessment_items(&input).expect("items");
        let statements: Vec<&str> = items
            .iter()
            .map(|item| {
                item.pointer("/objectivePlan/lessonObjectives/0/statement")
                    .and_then(Value::as_str)
                    .expect("statement")
            })
            .collect();
        assert_eq!(
            statements,
            [
                "Order fractions in ascending order",
                "Recognise fractions in everyday shapes",
            ],
        );
    }

    /// Any question drawn from this record would be counted towards a goal its
    /// own text argues against, so no call is planned for it.
    #[test]
    fn a_record_contradicting_every_goal_plans_no_call() {
        let input = lesson(
            &[
                "Exercise: arrange 1/2, 1/3 in ascending order.",
                "Exercise: arrange 2/5, 3/5 in descending order.",
            ],
            &["Order fractions in ascending order"],
        );
        let items = plan_assessment_items(&input).expect("items");
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0].pointer("/lesson/sourceEvidenceSnapshot/records/0/recordId"),
            Some(&json!("r0")),
        );
    }

    /// Every call answered "goal 1" because that is what it was shown; the
    /// assembled plan carries the sequence each call was actually paired with,
    /// in planning order.
    #[test]
    fn assembly_stamps_each_question_with_its_paired_goals_real_sequence() {
        let input = lesson(&["a", "b", "c"], &["first", "second"]);
        let written = vec![
            json!({"assessments": [{"question": "a", "lessonObjectiveSequence": 1}]}),
            json!({"assessments": [{"question": "b", "lessonObjectiveSequence": 1}, {"question": "c", "lessonObjectiveSequence": 1}]}),
            json!({"assessments": [{"question": "d", "lessonObjectiveSequence": 1}]}),
        ];
        let plan = collect_assessment_items(&input, written).expect("plan");
        let stamped: Vec<(&str, u64)> = plan["assessments"]
            .as_array()
            .expect("assessments")
            .iter()
            .map(|item| {
                (
                    item["question"].as_str().expect("question"),
                    item["lessonObjectiveSequence"].as_u64().expect("sequence"),
                )
            })
            .collect();
        assert_eq!(stamped, [("a", 1), ("b", 2), ("c", 2), ("d", 1)]);
    }

    #[test]
    fn a_call_is_far_smaller_than_the_stage_that_could_not_fit() {
        let whole = serde_json::to_string(&wide(12)).expect("json").len();
        let one = serde_json::to_string(&plan_assessment_items(&wide(12)).expect("items")[0])
            .expect("json")
            .len();
        assert!(
            one * 3 < whole,
            "one call is {one} against the whole at {whole}"
        );
    }

    #[test]
    fn a_lesson_with_no_records_is_refused_rather_than_planned_as_nothing() {
        plan_assessment_items(&lesson(&[], &["first"])).expect_err("nothing to write from");
    }

    /// A goal no source material supports cannot be covered by any assignment,
    /// and the refusal names what a teacher can act on rather than failing at
    /// assembly.
    #[test]
    fn a_goal_no_material_supports_is_refused_up_front() {
        let input = lesson(
            &["Exercise: arrange 1/2, 1/3 in ascending order."],
            &[
                "Order fractions in ascending order",
                "Order fractions in descending order",
            ],
        );
        let fault = plan_assessment_items(&input).expect_err("nothing covers descending");
        assert!(
            fault
                .diagnostics
                .iter()
                .any(|line| line.contains("Add source material") && line.contains("descending")),
            "the refusal must name the goal and the remedy: {:?}",
            fault.diagnostics,
        );
    }
}
