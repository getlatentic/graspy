//! Output-schema builders: the JSON-schema shape declared for each model-authored
//! stage, plus the small schema DSL and the catalogue-size reader that narrows
//! every sequence to the material a request actually supplies.

use super::deterministic_fault;
use crate::generation_program::domain::RuntimeFault;
use serde_json::{json, Map, Value};

pub(super) fn build_knowledge_output_schema(input: &Value) -> Result<Value, RuntimeFault> {
    let catalog = input.get("selectionCatalog").ok_or_else(|| {
        deterministic_fault(vec![
            "The knowledge-planning stage was given no selection catalogue.".to_owned(),
        ])
    })?;
    Ok(knowledge_schema(Some(&KnowledgeCatalogSize::read(
        catalog,
    )?)))
}

pub(super) fn strict_object(properties: Vec<(&str, Value)>) -> Value {
    let required = properties
        .iter()
        .map(|(name, _)| Value::String((*name).to_owned()))
        .collect::<Vec<_>>();
    let properties = properties
        .into_iter()
        .map(|(name, schema)| (name.to_owned(), schema))
        .collect::<Map<_, _>>();
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false
    })
}

/// An array the stage rejects when empty, declared so constrained decoding
/// cannot produce the empty case at all. Leaving it open and validating after
/// the fact spent a whole run rediscovering the same requirement each attempt.
fn non_empty_array(items: Value) -> Value {
    json!({"type": "array", "items": items, "minItems": 1})
}

/// An array that is one answer, not a list to fill: a stage that fans out per
/// item asks each call for exactly one.
fn exactly_one(items: Value) -> Value {
    json!({"type": "array", "items": items, "minItems": 1, "maxItems": 1})
}

/// An array whose empty case is a real answer, said out loud.
///
/// There is deliberately no helper that declines to say which of these an array
/// is. A schema silent about length reads the same whether empty was considered
/// and allowed or never considered at all, and the second is how a stage comes
/// to admit what its validator refuses.
fn may_be_empty_array(items: Value) -> Value {
    json!({"type": "array", "items": items, "minItems": 0})
}

/// An array of an exact length the stage can work out for itself. Without the
/// catalogue the length is unknown and the empty case is legitimate, so the
/// unbounded form says so rather than saying nothing.
fn sized_array(length: Option<usize>, items: Value) -> Value {
    match length {
        None => may_be_empty_array(items),
        Some(length) => json!({
            "type": "array", "items": items,
            "minItems": length, "maxItems": length
        }),
    }
}

/// A string the stage rejects when blank. Declared so the model cannot spend an
/// attempt on an answer the validator was always going to refuse.
fn non_empty_string() -> Value {
    json!({"type": "string", "minLength": 1})
}

fn integer() -> Value {
    json!({"type": "integer"})
}

fn string_enum(values: &[&str]) -> Value {
    json!({"type": "string", "enum": values})
}

pub(super) fn objective_schema() -> Value {
    strict_object(vec![(
        "lessonObjectives",
        non_empty_array(strict_object(vec![
            ("statement", non_empty_string()),
            ("sequence", integer()),
        ])),
    )])
}

fn misconception_schema(catalog: Option<&KnowledgeCatalogSize>) -> Value {
    strict_object(vec![
        ("statement", non_empty_string()),
        ("correction", non_empty_string()),
        (
            "knowledgeComponentSequences",
            non_empty_array(sequence(
                catalog.map(|catalog| catalog.knowledge_components),
            )),
        ),
        (
            "supportingRecordSequences",
            non_empty_array(sequence(catalog.map(|catalog| catalog.source_records))),
        ),
    ])
}

fn prior_knowledge_schema(catalog: Option<&KnowledgeCatalogSize>) -> Value {
    strict_object(vec![
        ("statement", non_empty_string()),
        (
            "knowledgeComponentSequences",
            non_empty_array(sequence(
                catalog.map(|catalog| catalog.knowledge_components),
            )),
        ),
        (
            "supportingRecordSequences",
            non_empty_array(sequence(catalog.map(|catalog| catalog.source_records))),
        ),
    ])
}

/// The registered signature declares the shape a knowledge plan takes; each
/// request narrows every sequence to the catalogue that request supplies.
pub(super) fn knowledge_schema(catalog: Option<&KnowledgeCatalogSize>) -> Value {
    // A lesson whose curriculum marks nothing as prior has no prior knowledge
    // to report. Declaring an empty-only array left the model free to fill it
    // and be rejected afterwards, so the field is simply not offered.
    let reports_prior_knowledge =
        catalog.is_none_or(|catalog| catalog.prior_knowledge_components > 0);
    let mut properties = vec![
        (
            "objectiveKnowledge",
            // One entry per objective that has a real choice. The model
            // returned two of four on every attempt, identically, and no
            // instruction or repair changed it — minItems is enforced by the
            // decoder, so the shortfall simply cannot be emitted.
            sized_array(
                catalog.map(|catalog| catalog.objectives_needing_choice),
                strict_object(vec![
                    (
                        "lessonObjectiveSequence",
                        sequence(catalog.map(|catalog| catalog.lesson_objectives)),
                    ),
                    (
                        "candidateSequence",
                        sequence(catalog.map(|catalog| catalog.candidates)),
                    ),
                ]),
            ),
        ),
        (
            "misconceptions",
            may_be_empty_array(misconception_schema(catalog)),
        ),
        // Rejected empty by validate_knowledge_plan, so it is declared required.
        (
            "instructionalMaterials",
            non_empty_array(non_empty_string()),
        ),
    ];
    if reports_prior_knowledge {
        properties.insert(
            2,
            (
                "priorKnowledge",
                may_be_empty_array(prior_knowledge_schema(catalog)),
            ),
        );
    }
    strict_object(properties)
}

/// How far each sequence number in a knowledge plan may reach, taken from the
/// catalogue the stage is given. Constraining the answer keeps a selection inside
/// the catalogue instead of leaving a stray number to be caught after the fact.
pub(super) struct KnowledgeCatalogSize {
    lesson_objectives: usize,
    candidates: usize,
    knowledge_components: usize,
    source_records: usize,
    /// A lesson whose curriculum marks nothing as prior knowledge has none to
    /// report. Asking for it anyway produced an entry that could only ever be
    /// rejected, and the stage failed every attempt on a lesson that was
    /// otherwise complete.
    pub(super) prior_knowledge_components: usize,
    /// How many objectives the model must choose for. Objectives with a single
    /// candidate are bound by the application, so they are not counted.
    pub(super) objectives_needing_choice: usize,
}

impl KnowledgeCatalogSize {
    pub(super) fn read(catalog: &Value) -> Result<Self, RuntimeFault> {
        let entries = |key: &str| {
            catalog.get(key).and_then(Value::as_array).ok_or_else(|| {
                deterministic_fault(vec![format!(
                    "The knowledge selection catalogue is missing its {key}."
                )])
            })
        };
        let objective_selections = entries("objectiveSelections")?;
        // Each objective offers its own candidates, which one bound cannot express,
        // so the widest list sets it. The stage still holds a selection to the
        // candidates of the objective it names.
        let candidates = objective_selections
            .iter()
            .map(|selection| {
                selection
                    .get("candidates")
                    .and_then(Value::as_array)
                    .map_or(0, Vec::len)
            })
            .max()
            .unwrap_or_default();
        let size = Self {
            lesson_objectives: objective_selections.len(),
            candidates,
            knowledge_components: entries("knowledgeComponents")?.len(),
            source_records: entries("sourceRecords")?.len(),
            objectives_needing_choice: objective_selections
                .iter()
                .filter(|selection| {
                    selection
                        .get("candidates")
                        .and_then(Value::as_array)
                        .is_some_and(|candidates| candidates.len() > 1)
                })
                .count(),
            prior_knowledge_components: entries("knowledgeComponents")?
                .iter()
                .filter(|component| {
                    component
                        .get("isPriorKnowledge")
                        .and_then(Value::as_bool)
                        .unwrap_or_default()
                })
                .count(),
        };
        size.validate()?;
        Ok(size)
    }

    fn validate(&self) -> Result<(), RuntimeFault> {
        let empty = [
            (self.lesson_objectives, "lesson objective"),
            (self.candidates, "knowledge candidate"),
            (self.knowledge_components, "knowledge component"),
            (self.source_records, "source record"),
        ]
        .into_iter()
        .find(|(size, _)| *size == 0);
        match empty {
            None => Ok(()),
            Some((_, missing)) => Err(deterministic_fault(vec![format!(
                "This lesson has no {missing} to plan knowledge from."
            )])),
        }
    }
}

/// A position in a supplied catalogue, counted from one and never past its end.
fn sequence(highest: Option<usize>) -> Value {
    match highest {
        None => json!({"type": "integer", "minimum": 1}),
        Some(highest) => json!({"type": "integer", "minimum": 1, "maximum": highest}),
    }
}

/// One call, one answer: exactly one assessment, for the one goal the call is
/// shown, which [`plan_assessment_items`] always renumbers to 1.
///
/// Both bounds are grammar-enforced by the engine, and both close a measured
/// failure: shown a single goal, the model still numbered its answers 1, 2, …
/// as list positions, and the per-item check refused "goal 2" five runs out of
/// five. A schema that admits what the validator refuses spends the whole
/// budget before the refusal.
pub(super) fn assessment_schema() -> Value {
    strict_object(vec![(
        "assessments",
        exactly_one(strict_object(vec![
            ("lessonObjectiveSequence", sequence(Some(1))),
            ("question", non_empty_string()),
            ("expectedAnswer", non_empty_string()),
            (
                "bloomLevel",
                string_enum(&[
                    "remember",
                    "understand",
                    "apply",
                    "analyze",
                    "evaluate",
                    "create",
                ]),
            ),
            ("rubric", non_empty_array(non_empty_string())),
        ])),
    )])
}

pub(super) fn core_instruction_schema() -> Value {
    let worked_step = strict_object(vec![
        ("label", non_empty_string()),
        ("content", non_empty_string()),
    ]);
    let worked_example = strict_object(vec![
        ("problem", non_empty_string()),
        ("steps", non_empty_array(worked_step)),
        ("finalAnswer", non_empty_string()),
    ]);
    strict_object(vec![(
        "coreSteps",
        non_empty_array(strict_object(vec![
            ("lessonObjectiveSequence", integer()),
            ("title", non_empty_string()),
            ("summary", non_empty_string()),
            ("teacherActivities", non_empty_array(non_empty_string())),
            ("learnerActivities", non_empty_array(non_empty_string())),
            ("explanations", non_empty_array(non_empty_string())),
            ("workedExamples", may_be_empty_array(worked_example)),
            ("figureSequences", may_be_empty_array(integer())),
        ])),
    )])
}

pub(super) fn core_practice_schema() -> Value {
    let practice = strict_object(vec![
        ("question", non_empty_string()),
        ("expectedAnswer", non_empty_string()),
        ("hints", may_be_empty_array(non_empty_string())),
    ]);
    strict_object(vec![(
        "coreSteps",
        non_empty_array(strict_object(vec![
            ("lessonObjectiveSequence", integer()),
            ("practiceQuestions", non_empty_array(practice)),
        ])),
    )])
}

/// What the assessment stage may write, sized to the lesson it was handed.
///
/// The stage writes one assessment per source record carrying an exercise, plus
/// cover for every learning goal, and each one is a question, an expected answer
/// and marking points. A fixed ceiling was measured on a twelve-record lesson
/// and held until a lesson with more to say met it: the engine stopped
/// mid-answer and the run failed with nothing to show for the tokens spent.
///
/// The ceiling is what the engine's context window can still hold once the
/// prompt is in it. Beyond that no budget helps, and a lesson that large is a
/// real failure to report rather than a number to inflate.
#[allow(dead_code)]
pub(super) fn build_assessment_output_budget(input: &Value) -> Result<u32, RuntimeFault> {
    const PER_ASSESSMENT_TOKENS: u32 = 260;
    const STRUCTURE_TOKENS: u32 = 400;
    const CEILING_TOKENS: u32 = 5_000;

    let records = input
        .pointer("/lesson/sourceEvidenceSnapshot/records")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let objectives = input
        .pointer("/objectivePlan/lessonObjectives")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    if records == 0 && objectives == 0 {
        return Err(deterministic_fault(vec![
            "The assessment stage was given neither source records nor learning goals to write questions for."
                .to_owned(),
        ]));
    }

    let items = u32::try_from(records + objectives).unwrap_or(u32::MAX / PER_ASSESSMENT_TOKENS);
    Ok((STRUCTURE_TOKENS + items.saturating_mul(PER_ASSESSMENT_TOKENS)).min(CEILING_TOKENS))
}

#[cfg(test)]
mod budget_tests {
    use super::*;
    use serde_json::json;

    fn input(records: usize, objectives: usize) -> Value {
        json!({
            "lesson": {
                "sourceEvidenceSnapshot": {
                    "records": vec![json!({"recordId": "r"}); records],
                },
            },
            "objectivePlan": {
                "lessonObjectives": vec![json!({"sequence": 1}); objectives],
            },
        })
    }

    /// The failure this exists for: a lesson with more to say met a ceiling
    /// measured on a smaller one, and the engine stopped mid-answer.
    #[test]
    fn a_lesson_with_more_to_write_is_given_more_room() {
        let small = build_assessment_output_budget(&input(4, 3)).expect("a budget");
        let large = build_assessment_output_budget(&input(12, 6)).expect("a budget");
        assert!(large > small, "{large} is not more room than {small}");
    }

    /// The old constant was 3,600 and a twelve-record lesson overran it. The
    /// derived budget has to clear that, or the fix changes nothing.
    #[test]
    fn the_lesson_that_overran_the_old_ceiling_now_clears_it() {
        assert!(build_assessment_output_budget(&input(12, 6)).expect("a budget") > 3_600);
    }

    /// Past the context window no budget helps, so the number stops growing
    /// rather than promising room the engine does not have.
    #[test]
    fn the_budget_stops_at_what_the_engine_can_hold() {
        assert_eq!(
            build_assessment_output_budget(&input(400, 400)).expect("a budget"),
            build_assessment_output_budget(&input(900, 900)).expect("a budget"),
        );
    }

    #[test]
    fn a_stage_with_nothing_to_write_for_is_refused_rather_than_given_a_floor() {
        build_assessment_output_budget(&input(0, 0)).expect_err("nothing to write for");
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    use crate::generation_program::domain::validate_value_against_schema;
    use crate::lesson_planning::program::test_support::*;
    use crate::lesson_planning::program::*;

    /// The catalogue the knowledge stage is shown and the schema it must answer in
    /// are built from the same request, so a sequence number cannot be decoded
    /// outside the catalogue in the first place.
    #[test]
    fn knowledge_schema_bounds_every_sequence_to_the_supplied_catalogue() {
        let (input, objectives, _, _, _, _) = input_and_stage_outputs();
        let node_input = knowledge_node_input(&input, &objectives);
        let catalog = &node_input["selectionCatalog"];
        let schema = build_knowledge_output_schema(&node_input).expect("knowledge schema");

        let components = catalog["knowledgeComponents"]
            .as_array()
            .expect("catalogued knowledge components")
            .len();
        let records = catalog["sourceRecords"]
            .as_array()
            .expect("catalogued source records")
            .len();
        let objective_selections = catalog["objectiveSelections"]
            .as_array()
            .expect("catalogued objective selections")
            .len();

        let bound = |pointer: &str| {
            let field = schema.pointer(pointer).expect("bounded sequence field");
            (
                field["minimum"].as_u64().expect("a lowest sequence"),
                field["maximum"].as_u64().expect("a highest sequence"),
            )
        };

        assert_eq!(
            bound("/properties/objectiveKnowledge/items/properties/lessonObjectiveSequence"),
            (1, objective_selections as u64)
        );
        assert_eq!(
            bound("/properties/misconceptions/items/properties/knowledgeComponentSequences/items"),
            (1, components as u64)
        );
        assert_eq!(
            bound("/properties/priorKnowledge/items/properties/knowledgeComponentSequences/items"),
            (1, components as u64)
        );
        assert_eq!(
            bound("/properties/misconceptions/items/properties/supportingRecordSequences/items"),
            (1, records as u64)
        );
    }

    /// The bound the model decodes against is the same bound the stage checks, so
    /// a sequence past the catalogue is rejected as a schema failure the repair is
    /// told about, not discovered later as an unresolvable selection.
    #[test]
    fn a_sequence_past_the_catalogue_fails_the_knowledge_schema() {
        let (input, objectives, _, _, _, _) = input_and_stage_outputs();
        let node_input = knowledge_node_input(&input, &objectives);
        let schema = build_knowledge_output_schema(&node_input).expect("knowledge schema");
        let components = node_input["selectionCatalog"]["knowledgeComponents"]
            .as_array()
            .expect("catalogued knowledge components")
            .len();

        let beyond_catalogue = json!({
            "objectiveKnowledge": [],
            "misconceptions": [{
                "statement": "Longer numerators mean larger fractions.",
                "correction": "Compare against a common denominator.",
                "knowledgeComponentSequences": [components + 1],
                "supportingRecordSequences": [1],
            }],
            "priorKnowledge": [],
            "instructionalMaterials": ["Fraction strips"],
        });

        assert!(!validate_value_against_schema(&beyond_catalogue, &schema).passed);
    }

    /// A lesson with nothing to plan knowledge from is a stated failure, never a
    /// schema that no answer can satisfy.
    #[test]
    fn an_empty_catalogue_is_refused_rather_than_bounded_to_nothing() {
        let empty = json!({
            "selectionCatalog": {
                "objectiveSelections": [],
                "knowledgeComponents": [],
                "sourceRecords": [],
            }
        });

        let fault = build_knowledge_output_schema(&empty).expect_err("refused empty catalogue");

        assert_eq!(fault.kind, RuntimeFaultKind::Deterministic);
    }

    #[test]
    fn practice_output_schema_cannot_modify_worked_examples() {
        let encoded = serde_json::to_string(&core_practice_schema()).expect("practice schema");

        assert!(encoded.contains("practiceQuestions"));
        assert!(!encoded.contains("workedExamples"));
        assert!(!encoded.contains("explanations"));
    }

    /// The test below pins the specific fields that drifted. This one pins the
    /// rest, mechanically: every string the model fills, anywhere in any stage
    /// schema, must be bounded — non-empty, or an enum of allowed values. A field
    /// added later cannot quietly reopen the schema-admits-what-a-validator-refuses
    /// gap, because it is walked here without anyone remembering to list it.
    #[test]
    fn every_generated_string_is_bounded_across_the_stage_schemas() {
        fn assert_strings_bounded(schema: &Value, path: &str) {
            match schema {
                Value::Object(node) => {
                    if node.get("type").and_then(Value::as_str) == Some("string")
                        && !node.contains_key("enum")
                    {
                        assert_eq!(
                            node.get("minLength").and_then(Value::as_u64),
                            Some(1),
                            "{path} is an unbounded string; a stage schema must forbid the blank its validator refuses"
                        );
                    }
                    for (key, child) in node {
                        assert_strings_bounded(child, &format!("{path}.{key}"));
                    }
                }
                Value::Array(items) => {
                    for (index, item) in items.iter().enumerate() {
                        assert_strings_bounded(item, &format!("{path}[{index}]"));
                    }
                }
                _ => {}
            }
        }

        for (stage, schema) in [
            ("objective", objective_schema()),
            ("knowledge", knowledge_schema(None)),
            ("assessment", assessment_schema()),
            ("core-instruction", core_instruction_schema()),
            ("core-practice", core_practice_schema()),
        ] {
            assert_strings_bounded(&schema, stage);
        }
    }

    /// The array half of the same defect. A schema that says nothing about an
    /// array's length lets constrained decoding return one its validator will
    /// refuse, and the model spends an attempt discovering that.
    ///
    /// Unlike a string, empty is sometimes the right answer — `figureSequences`
    /// is empty when the run supplied no figures — so the rule cannot be
    /// "non-empty". It is "say which": an array declares `minItems`, and `0`
    /// is a legitimate declaration meaning empty is allowed on purpose.
    /// Silence is the smell, because silence is indistinguishable from an
    /// author who never considered it.
    #[test]
    fn every_generated_array_says_whether_it_may_be_empty() {
        fn assert_arrays_declare_length(schema: &Value, path: &str) {
            match schema {
                Value::Object(node) => {
                    if node.get("type").and_then(Value::as_str) == Some("array") {
                        assert!(
                            node.contains_key("minItems"),
                            "{path} is an array that never says whether it may be empty; declare minItems, using 0 where empty is a legitimate answer",
                        );
                    }
                    for (key, child) in node {
                        assert_arrays_declare_length(child, &format!("{path}.{key}"));
                    }
                }
                Value::Array(items) => {
                    for (index, item) in items.iter().enumerate() {
                        assert_arrays_declare_length(item, &format!("{path}[{index}]"));
                    }
                }
                _ => {}
            }
        }

        for (stage, schema) in [
            ("objective", objective_schema()),
            ("knowledge", knowledge_schema(None)),
            ("assessment", assessment_schema()),
            ("core-instruction", core_instruction_schema()),
            ("core-practice", core_practice_schema()),
        ] {
            assert_arrays_declare_length(&schema, stage);
        }
    }

    /// One defect, found nine times across four stages: a schema admitting a
    /// value its validator refuses, so the model spends attempts on answers
    /// that were never acceptable. Every field a stage rejects blank or empty
    /// must say so in the schema, where constrained decoding can enforce it.
    #[test]
    fn no_stage_offers_a_blank_or_empty_value_its_validator_refuses() {
        let catalogue = json!({
            "lessonObjectives": [{"sequence": 1}],
            "objectiveSelections": [{"lessonObjectiveSequence": 1, "candidates": [{"candidateSequence": 1}]}],
            "knowledgeComponents": [{"sequence": 1, "isPriorKnowledge": true}],
            "sourceRecords": [{"sequence": 1}]
        });
        let size = KnowledgeCatalogSize::read(&catalogue).expect("a readable catalogue");

        let required: Vec<(&str, Value)> = vec![
            (
                "objective statement",
                objective_schema()["properties"]["lessonObjectives"]["items"]["properties"]
                    ["statement"]
                    .clone(),
            ),
            (
                "core step title",
                core_instruction_schema()["properties"]["coreSteps"]["items"]["properties"]
                    ["title"]
                    .clone(),
            ),
            (
                "core step summary",
                core_instruction_schema()["properties"]["coreSteps"]["items"]["properties"]
                    ["summary"]
                    .clone(),
            ),
            (
                "practice question",
                core_practice_schema()["properties"]["coreSteps"]["items"]["properties"]
                    ["practiceQuestions"]["items"]["properties"]["question"]
                    .clone(),
            ),
            (
                "prior knowledge statement",
                knowledge_schema(Some(&size))["properties"]["priorKnowledge"]["items"]
                    ["properties"]["statement"]
                    .clone(),
            ),
        ];
        for (name, field) in required {
            assert_eq!(field["minLength"], json!(1), "{name} is refused blank");
        }

        let listed: Vec<(&str, Value)> = vec![
            (
                "teacher activities",
                core_instruction_schema()["properties"]["coreSteps"]["items"]["properties"]
                    ["teacherActivities"]
                    .clone(),
            ),
            (
                "learner activities",
                core_instruction_schema()["properties"]["coreSteps"]["items"]["properties"]
                    ["learnerActivities"]
                    .clone(),
            ),
            (
                "explanations",
                core_instruction_schema()["properties"]["coreSteps"]["items"]["properties"]
                    ["explanations"]
                    .clone(),
            ),
            (
                "practice questions",
                core_practice_schema()["properties"]["coreSteps"]["items"]["properties"]
                    ["practiceQuestions"]
                    .clone(),
            ),
            (
                "instructionalMaterials",
                knowledge_schema(Some(&size))["properties"]["instructionalMaterials"].clone(),
            ),
        ];
        for (name, field) in listed {
            assert_eq!(field["minItems"], json!(1), "{name} is refused empty");
        }
    }

    /// Six failures in one run came from schemas that admitted what a validator
    /// refused. This pins the assessment stage against the same drift.
    #[test]
    fn the_assessment_schema_forbids_what_its_validator_refuses() {
        let schema = assessment_schema();
        let fields = &schema["properties"]["assessments"]["items"]["properties"];

        assert_eq!(fields["question"]["minLength"], json!(1));
        assert_eq!(fields["expectedAnswer"]["minLength"], json!(1));
        assert_eq!(
            fields["rubric"]["minItems"],
            json!(1),
            "an empty rubric is rejected, so it is not offered"
        );
        assert_eq!(fields["rubric"]["items"]["minLength"], json!(1));

        // A call is shown one goal, renumbered 1, and asked for one assessment.
        // Left open, the model numbered its answers as list positions — "goal
        // 2" from a call shown a single goal, five runs out of five.
        assert_eq!(schema["properties"]["assessments"]["maxItems"], json!(1));
        assert_eq!(fields["lessonObjectiveSequence"]["maximum"], json!(1));
    }

    #[test]
    fn forbids_the_empty_arrays_the_stage_would_reject_after_the_fact() {
        let catalogue = json!({
            "lessonObjectives": [{"sequence": 1}],
            "objectiveSelections": [{"lessonObjectiveSequence": 1, "candidates": [{"candidateSequence": 1}]}],
            "knowledgeComponents": [{"sequence": 1, "isPriorKnowledge": true}],
            "sourceRecords": [{"sequence": 1}]
        });
        let size = KnowledgeCatalogSize::read(&catalogue).expect("a readable catalogue");
        let schema = knowledge_schema(Some(&size));

        assert_eq!(
            schema["properties"]["instructionalMaterials"]["minItems"],
            json!(1),
            "the stage rejects an empty instructional materials list, so the schema forbids it"
        );

        for group in ["misconceptions", "priorKnowledge"] {
            let item = &schema["properties"][group]["items"]["properties"];
            assert_eq!(
                item["supportingRecordSequences"]["minItems"],
                json!(1),
                "{group} must cite evidence, so the empty array is not offered"
            );
            assert_eq!(
                item["knowledgeComponentSequences"]["minItems"],
                json!(1),
                "{group} must cite knowledge, so the empty array is not offered"
            );
        }
    }

    /// The model returned two selections for four objectives on every attempt,
    /// identically, through three different repair messages and a varied seed.
    /// The count is knowable from the catalogue, so the schema states it.
    #[test]
    fn the_selection_array_is_sized_to_the_objectives_that_need_a_choice() {
        let catalogue = json!({
            "lessonObjectives": [{"sequence": 1}, {"sequence": 2}, {"sequence": 3}],
            "objectiveSelections": [
                {"lessonObjectiveSequence": 1, "candidates": [{"candidateSequence": 1}, {"candidateSequence": 2}]},
                {"lessonObjectiveSequence": 2, "candidates": [{"candidateSequence": 1}, {"candidateSequence": 2}]},
                {"lessonObjectiveSequence": 3, "candidates": [{"candidateSequence": 1}]}
            ],
            "knowledgeComponents": [{"sequence": 1, "isPriorKnowledge": false}],
            "sourceRecords": [{"sequence": 1}]
        });
        let size = KnowledgeCatalogSize::read(&catalogue).expect("a readable catalogue");
        assert_eq!(
            size.objectives_needing_choice, 2,
            "the single-candidate objective is bound by the application"
        );

        let selections = knowledge_schema(Some(&size))["properties"]["objectiveKnowledge"].clone();
        assert_eq!(selections["minItems"], json!(2));
        assert_eq!(selections["maxItems"], json!(2));
    }

    #[test]
    fn forbids_prior_knowledge_when_the_curriculum_marks_none_as_prior() {
        let catalogue = json!({
            "lessonObjectives": [{"sequence": 1}],
            "objectiveSelections": [{"lessonObjectiveSequence": 1, "candidates": [{"candidateSequence": 1}]}],
            "knowledgeComponents": [
                {"sequence": 1, "isPriorKnowledge": false},
                {"sequence": 2, "isPriorKnowledge": false}
            ],
            "sourceRecords": [{"sequence": 1}]
        });
        let size = KnowledgeCatalogSize::read(&catalogue).expect("a readable catalogue");
        assert_eq!(size.prior_knowledge_components, 0);

        let schema = knowledge_schema(Some(&size));
        // Not offered at all, rather than offered and refused: an empty-only
        // array was not enforced by the decoder, so the model filled it and was
        // rejected after spending the attempt.
        assert!(
            schema["properties"]["priorKnowledge"].is_null(),
            "nothing is marked prior, so the field is not asked for"
        );
        assert!(
            !schema["required"]
                .as_array()
                .expect("required list")
                .contains(&json!("priorKnowledge")),
            "and it is not required"
        );

        let with_prior = json!({
            "lessonObjectives": [{"sequence": 1}],
            "objectiveSelections": [{"lessonObjectiveSequence": 1, "candidates": [{"candidateSequence": 1}]}],
            "knowledgeComponents": [
                {"sequence": 1, "isPriorKnowledge": true},
                {"sequence": 2, "isPriorKnowledge": false}
            ],
            "sourceRecords": [{"sequence": 1}]
        });
        let size = KnowledgeCatalogSize::read(&with_prior).expect("a readable catalogue");
        let schema = knowledge_schema(Some(&size));
        assert!(
            schema["properties"]["priorKnowledge"]["items"].is_object(),
            "prior knowledge exists, so entries stay available"
        );
    }
}
