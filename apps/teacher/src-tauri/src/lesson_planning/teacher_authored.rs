//! Preparing a lesson a teacher wrote themselves, with no curriculum package and
//! no scheme of work behind it.
//!
//! The pipeline needs a curriculum snapshot: what the learners must be able to
//! do, what they have to know to do it, and which sources back each of those.
//! A teacher who types a topic and a few goals supplies the first of those three.
//! The second is classification work the model does, and the third comes from
//! searching the installed library for what the teacher actually wrote.
//!
//! Nothing here asks the model for an identifier. Goals and sources are referred
//! to by their position in the lists the model is shown, and every identifier is
//! attached afterwards.

use serde::Deserialize;
use serde_json::{json, Value};

use crate::content_corpus::TextbookExcerpt;

use super::granular::{
    AtomicObjective, BloomLevel, CurriculumObjectiveRef, CurriculumSnapshot, KnowledgeComponent,
    KnowledgeType,
};

/// How the model classifies one of the teacher's goals.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DraftedLearningGoal {
    pub goal_sequence: u16,
    pub bloom_verb: String,
    pub bloom_level: BloomLevel,
}

/// One thing a learner has to know to reach the goals it serves.
#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DraftedKnowledgeComponent {
    pub description: String,
    pub knowledge_type: KnowledgeType,
    pub bloom_level: BloomLevel,
    pub is_prior_knowledge: bool,
    pub goal_sequences: Vec<u16>,
    pub supporting_record_sequences: Vec<u16>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DraftedTeachingGround {
    pub learning_goals: Vec<DraftedLearningGoal>,
    pub knowledge_components: Vec<DraftedKnowledgeComponent>,
}

pub const TEACHING_GROUND_INSTRUCTIONS: &str = concat!(
    "A teacher has written a lesson topic and the goals they want their learners to reach, and the ",
    "matching pages from the source library are supplied. Classify each goal and set out what a learner ",
    "must know to reach it.\n\n",
    "Give every goal its Bloom level and the verb that carries it, using the goal's own wording rather ",
    "than a verb you introduce. Return one entry per goal, in the order supplied.\n\n",
    "Then describe the knowledge the lesson rests on. Separate what learners must already have (prior ",
    "knowledge) from what this lesson teaches. Every knowledge item must name at least one goal it serves ",
    "and at least one supplied source it comes from, by the sequence numbers given. Describe only knowledge ",
    "the supplied sources actually support.\n\n",
    "Every goal must be served by at least one item this lesson teaches, marked as not prior knowledge. ",
    "A goal whose knowledge is all prior knowledge has nothing left to teach."
);

/// The shape the model must return. Positions, never identifiers.
pub fn teaching_ground_schema(goal_count: usize) -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["learningGoals", "knowledgeComponents"],
        "properties": {
            "learningGoals": {
                "type": "array",
                "minItems": goal_count,
                "maxItems": goal_count,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["goalSequence", "bloomVerb", "bloomLevel"],
                    "properties": {
                        "goalSequence": { "type": "integer" },
                        "bloomVerb": { "type": "string" },
                        "bloomLevel": bloom_levels(),
                    }
                }
            },
            "knowledgeComponents": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                        "description", "knowledgeType", "bloomLevel",
                        "isPriorKnowledge", "goalSequences", "supportingRecordSequences"
                    ],
                    "properties": {
                        "description": { "type": "string" },
                        "knowledgeType": { "type": "string", "enum": ["concept", "procedure", "representation"] },
                        "bloomLevel": bloom_levels(),
                        "isPriorKnowledge": { "type": "boolean" },
                        "goalSequences": { "type": "array", "items": { "type": "integer" }, "minItems": 1 },
                        "supportingRecordSequences": { "type": "array", "items": { "type": "integer" }, "minItems": 1 }
                    }
                }
            }
        }
    })
}

fn bloom_levels() -> Value {
    json!({
        "type": "string",
        "enum": ["remember", "understand", "apply", "analyze", "evaluate", "create"]
    })
}

/// What the model is shown: the teacher's goals and the found sources, each
/// numbered so it can point at them without reproducing anything.
pub fn teaching_ground_input(
    topic: &str,
    subtopic: Option<&str>,
    goals: &[String],
    records: &[TextbookExcerpt],
) -> Value {
    json!({
        "topic": topic,
        "subtopic": subtopic,
        "learningGoals": goals
            .iter()
            .enumerate()
            .map(|(index, goal)| json!({ "sequence": index + 1, "statement": goal }))
            .collect::<Vec<_>>(),
        "sourceRecords": records
            .iter()
            .enumerate()
            .map(|(index, record)| json!({
                "sequence": index + 1,
                "title": record.title,
                "excerpt": record.text,
            }))
            .collect::<Vec<_>>(),
    })
}

/// The phrases worth searching the library for, from what the teacher wrote.
pub fn retrieval_phrases<'a>(
    topic: &'a str,
    subtopic: Option<&'a str>,
    goals: &'a [String],
) -> Vec<&'a str> {
    std::iter::once(topic)
        .chain(subtopic)
        .chain(goals.iter().map(String::as_str))
        .filter(|phrase| !phrase.trim().is_empty())
        .collect()
}

/// The curriculum snapshot for a teacher-authored lesson.
///
/// The teacher's goals are the objectives; they are not rewritten, because the
/// classwork has to teach what was asked for. Everything the model returned is
/// content, and every identifier below is attached here.
pub fn curriculum_snapshot_from_goals(
    goals: &[String],
    records: &[TextbookExcerpt],
    drafted: &DraftedTeachingGround,
) -> Result<CurriculumSnapshot, String> {
    validate_teaching_ground(goals, records, drafted)?;

    let objectives = goals
        .iter()
        .enumerate()
        .map(|(index, statement)| CurriculumObjectiveRef {
            id: format!("teacher-objective-{}", index + 1),
            statement: statement.clone(),
            sequence: index as u16 + 1,
        })
        .collect::<Vec<_>>();

    let atomic_objectives = drafted
        .learning_goals
        .iter()
        .map(|goal| {
            let index = goal.goal_sequence as usize - 1;
            AtomicObjective {
                id: format!("teacher-atomic-objective-{}", goal.goal_sequence),
                curriculum_objective_id: objectives[index].id.clone(),
                statement: goals[index].clone(),
                bloom_verb: goal.bloom_verb.clone(),
                bloom_level: goal.bloom_level,
                sequence: goal.goal_sequence,
            }
        })
        .collect::<Vec<_>>();

    let knowledge_components = drafted
        .knowledge_components
        .iter()
        .enumerate()
        .map(|(index, component)| KnowledgeComponent {
            id: format!("teacher-knowledge-{}", index + 1),
            description: component.description.clone(),
            knowledge_type: component.knowledge_type,
            bloom_level: component.bloom_level,
            atomic_objective_ids: component
                .goal_sequences
                .iter()
                .map(|sequence| format!("teacher-atomic-objective-{sequence}"))
                .collect(),
            prerequisite_knowledge_component_ids: Vec::new(),
            supporting_record_ids: component
                .supporting_record_sequences
                .iter()
                .map(|sequence| records[*sequence as usize - 1].record_id.clone())
                .collect(),
            source_form: None,
            target_form: None,
            is_prior_knowledge: component.is_prior_knowledge,
        })
        .collect::<Vec<_>>();

    Ok(CurriculumSnapshot {
        package_id: None,
        package_title: None,
        package_sha256: None,
        course_id: None,
        curriculum_node_id: None,
        objectives,
        atomic_objectives,
        knowledge_components,
    })
}

/// Everything the snapshot builder would otherwise have to trust: that each goal
/// was classified exactly once, and that nothing points outside the lists the
/// model was shown.
fn validate_teaching_ground(
    goals: &[String],
    records: &[TextbookExcerpt],
    drafted: &DraftedTeachingGround,
) -> Result<(), String> {
    if goals.is_empty() {
        return Err("Write at least one learning goal for this lesson.".to_owned());
    }
    if records.is_empty() {
        return Err("No source material was found for this lesson.".to_owned());
    }

    let mut classified = vec![false; goals.len()];
    for goal in &drafted.learning_goals {
        let index = goal_index(goal.goal_sequence, goals.len())?;
        if std::mem::replace(&mut classified[index], true) {
            return Err(format!(
                "Learning goal {} was classified more than once.",
                goal.goal_sequence
            ));
        }
        if goal.bloom_verb.trim().is_empty() {
            return Err(format!(
                "Learning goal {} needs the verb that carries it.",
                goal.goal_sequence
            ));
        }
    }
    if let Some(missing) = classified.iter().position(|done| !done) {
        return Err(format!("Learning goal {} was not classified.", missing + 1));
    }

    if drafted.knowledge_components.is_empty() {
        return Err("Set out what a learner must know to reach these goals.".to_owned());
    }
    // A goal served only by knowledge the learners already have leaves the lesson
    // nothing to teach for it, and the pipeline refuses such an objective later.
    // Catching it here means the model is asked again rather than the teacher
    // being told, several stages on, that an objective has no knowledge.
    let mut taught = vec![false; goals.len()];
    for component in &drafted.knowledge_components {
        if component.is_prior_knowledge {
            continue;
        }
        for sequence in &component.goal_sequences {
            if let Ok(index) = goal_index(*sequence, goals.len()) {
                taught[index] = true;
            }
        }
    }
    if let Some(missing) = taught.iter().position(|done| !done) {
        return Err(format!(
            "Learning goal {} has nothing this lesson teaches: every knowledge item for it is prior knowledge.",
            missing + 1
        ));
    }

    for (index, component) in drafted.knowledge_components.iter().enumerate() {
        if component.description.trim().is_empty() {
            return Err(format!("Knowledge item {} says nothing.", index + 1));
        }
        for sequence in &component.goal_sequences {
            goal_index(*sequence, goals.len())?;
        }
        for sequence in &component.supporting_record_sequences {
            if *sequence == 0 || *sequence as usize > records.len() {
                return Err(format!(
                    "Knowledge item {} cites source {sequence}, which was not supplied.",
                    index + 1
                ));
            }
        }
    }
    Ok(())
}

fn goal_index(sequence: u16, goal_count: usize) -> Result<usize, String> {
    if sequence == 0 || sequence as usize > goal_count {
        return Err(format!(
            "Learning goal {sequence} was named, but the teacher wrote {goal_count}."
        ));
    }
    Ok(sequence as usize - 1)
}

/// What gated tests use to classify a teacher's goals against the real model.
///
/// The lesson itself is classified by `inference`, which validates the result
/// and repairs once. This mirrors that, down to sampling a different path on the
/// retry, because a gated test only says something about the product while the
/// two behave alike.
#[cfg(test)]
pub(crate) async fn derive_teaching_ground(
    base_url: &str,
    topic: &str,
    subtopic: Option<&str>,
    goals: &[String],
    records: &[TextbookExcerpt],
) -> Result<DraftedTeachingGround, String> {
    let drafted = request_teaching_ground(base_url, topic, subtopic, goals, records, None).await?;
    let Err(failure) = validate_teaching_ground(goals, records, &drafted) else {
        return Ok(drafted);
    };
    let repaired =
        request_teaching_ground(base_url, topic, subtopic, goals, records, Some(&failure)).await?;
    validate_teaching_ground(goals, records, &repaired)?;
    Ok(repaired)
}

#[cfg(test)]
async fn request_teaching_ground(
    base_url: &str,
    topic: &str,
    subtopic: Option<&str>,
    goals: &[String],
    records: &[TextbookExcerpt],
    correcting: Option<&str>,
) -> Result<DraftedTeachingGround, String> {
    let instruction = match correcting {
        None => "Return the complete structured result.".to_owned(),
        Some(failure) => format!(
            "Your previous answer was rejected: {failure}\n\nReturn the complete structured \
             result again, correcting that."
        ),
    };
    let response = reqwest::Client::new()
        .post(format!(
            "{}/v1/chat/completions",
            base_url.trim_end_matches('/')
        ))
        .json(&json!({
            "model": "graspy-local",
            "temperature": 0.1,
            // A retry pinned to the same sampling path is not a retry: the first
            // attempt already showed where that path leads.
            "seed": if correcting.is_some() { 32 } else { 31 },
            "messages": [
                { "role": "system", "content": TEACHING_GROUND_INSTRUCTIONS },
                {
                    "role": "user",
                    "content": format!(
                        "{instruction}\n\nInput:\n{}",
                        teaching_ground_input(topic, subtopic, goals, records)
                    )
                }
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "teaching_ground",
                    "strict": true,
                    "schema": teaching_ground_schema(goals.len())
                }
            }
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let body: Value = response.json().await.map_err(|error| error.to_string())?;
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| "the reply had no completion".to_owned())?;
    serde_json::from_str(content).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content_corpus::ContentCorpus;

    fn goals() -> Vec<String> {
        vec![
            "Compare two fractions using visual models.".to_owned(),
            "Order three fractions from least to greatest.".to_owned(),
        ]
    }

    fn records() -> Vec<TextbookExcerpt> {
        ["record-a", "record-b"]
            .into_iter()
            .map(|record_id| TextbookExcerpt {
                record_id: record_id.to_owned(),
                title: "Equivalent fractions".to_owned(),
                text: "Rewrite fractions with a common denominator.".to_owned(),
                attribution: crate::content_corpus::CorpusAttribution {
                    package_id: "siyavula".to_owned(),
                    title: "Siyavula Mathematics".to_owned(),
                    publisher: "Siyavula".to_owned(),
                    source_url: String::new(),
                    licence_name: "CC BY".to_owned(),
                    licence_url: String::new(),
                    attribution: "Siyavula Mathematics".to_owned(),
                },
            })
            .collect()
    }

    fn drafted() -> DraftedTeachingGround {
        DraftedTeachingGround {
            learning_goals: vec![
                DraftedLearningGoal {
                    goal_sequence: 1,
                    bloom_verb: "compare".to_owned(),
                    bloom_level: BloomLevel::Understand,
                },
                DraftedLearningGoal {
                    goal_sequence: 2,
                    bloom_verb: "order".to_owned(),
                    bloom_level: BloomLevel::Apply,
                },
            ],
            knowledge_components: vec![DraftedKnowledgeComponent {
                description: "A common denominator lets two fractions be compared.".to_owned(),
                knowledge_type: KnowledgeType::Procedure,
                bloom_level: BloomLevel::Apply,
                is_prior_knowledge: false,
                goal_sequences: vec![1, 2],
                supporting_record_sequences: vec![2],
            }],
        }
    }

    #[test]
    fn the_teachers_goals_become_the_objectives_and_ids_are_attached_here() {
        let snapshot =
            curriculum_snapshot_from_goals(&goals(), &records(), &drafted()).expect("a snapshot");

        assert!(
            snapshot.package_id.is_none(),
            "there is no curriculum to name"
        );
        assert_eq!(snapshot.objectives.len(), 2);
        assert_eq!(snapshot.objectives[0].statement, goals()[0]);
        assert_eq!(snapshot.atomic_objectives[1].bloom_verb, "order");
        // The cited source is the second record, so it must resolve to that id.
        assert_eq!(
            snapshot.knowledge_components[0].supporting_record_ids,
            vec!["record-b".to_owned()]
        );
        assert_eq!(
            snapshot.knowledge_components[0].atomic_objective_ids,
            vec![
                "teacher-atomic-objective-1".to_owned(),
                "teacher-atomic-objective-2".to_owned()
            ]
        );
    }

    #[test]
    fn a_goal_left_unclassified_is_refused() {
        let mut drafted = drafted();
        drafted.learning_goals.pop();

        let error = curriculum_snapshot_from_goals(&goals(), &records(), &drafted)
            .expect_err("an unclassified goal must be refused");

        assert!(error.contains("goal 2"), "{error}");
    }

    #[test]
    fn a_goal_whose_knowledge_is_all_prior_knowledge_is_refused() {
        let mut drafted = drafted();
        drafted.knowledge_components[0].is_prior_knowledge = true;

        let error = curriculum_snapshot_from_goals(&goals(), &records(), &drafted)
            .expect_err("a goal with nothing left to teach must be refused");

        assert!(error.contains("nothing this lesson teaches"), "{error}");
    }

    #[test]
    fn knowledge_citing_a_source_that_was_not_supplied_is_refused() {
        let mut drafted = drafted();
        drafted.knowledge_components[0].supporting_record_sequences = vec![9];

        let error = curriculum_snapshot_from_goals(&goals(), &records(), &drafted)
            .expect_err("a citation outside the supplied sources must be refused");

        assert!(error.contains("source 9"), "{error}");
    }

    #[test]
    fn the_searched_phrases_are_what_the_teacher_wrote() {
        let goals = goals();
        let phrases = retrieval_phrases("Fractions", Some("Comparing fractions"), &goals);

        assert_eq!(phrases[0], "Fractions");
        assert_eq!(phrases[1], "Comparing fractions");
        assert_eq!(phrases.len(), 4);
    }

    /// The whole teacher-authored path against the real library and the real
    /// model: what the teacher typed finds sources, and those sources ground a
    /// snapshot the pipeline will accept.
    #[tokio::test]
    #[ignore = "requires a qualified local llama-server; set GRASPY_LLAMA_BASE_URL"]
    async fn builds_a_grounded_snapshot_from_what_a_teacher_typed() {
        let base_url = std::env::var("GRASPY_LLAMA_BASE_URL")
            .expect("GRASPY_LLAMA_BASE_URL must identify a running local server");
        let corpus = ContentCorpus::default();
        corpus
            .init_at(std::path::Path::new(
                "resources/content/siyavula-jss1-mathematics-v1/corpus.sqlite3",
            ))
            .expect("the bundled source library opens");

        let topic = "Equivalent fractions";
        let goals = goals();
        let phrases = retrieval_phrases(topic, None, &goals);
        let records = corpus
            .find_source_material(&phrases, 5)
            .expect("the library is searchable by what the teacher wrote");
        assert!(!records.is_empty(), "the teacher's words must find sources");

        let drafted = derive_teaching_ground(&base_url, topic, None, &goals, &records)
            .await
            .expect("the local model classifies the goals");

        let snapshot = curriculum_snapshot_from_goals(&goals, &records, &drafted)
            .expect("a snapshot the pipeline will accept");

        assert_eq!(snapshot.atomic_objectives.len(), goals.len());
        assert!(!snapshot.knowledge_components.is_empty());
        for component in &snapshot.knowledge_components {
            assert!(
                !component.supporting_record_ids.is_empty(),
                "every knowledge item must cite a source it came from"
            );
        }
        println!(
            "found {} sources; derived {} knowledge items",
            records.len(),
            snapshot.knowledge_components.len()
        );
    }
}
