//! What the model is shown, as distinct from what the program keeps.

use serde_json::{Map, Value};

/// The input with identifiers and content digests taken out.
///
/// Nothing the model returns names an identifier. Every one is attached
/// afterwards from the position or the alignment the program already holds, so
/// the identifiers in the input are there for the program's benefit and not the
/// model's. Showing them anyway spends the context window on strings a small
/// model can only copy, and copying them is the thing it does worst.
pub fn without_bookkeeping(input: &Value) -> Value {
    match input {
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .filter(|(name, _)| !is_bookkeeping(name))
                .map(|(name, value)| (name.clone(), without_bookkeeping(value)))
                .collect::<Map<_, _>>(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(without_bookkeeping).collect()),
        other => other.clone(),
    }
}

/// Whether a field carries a handle or a digest rather than something to teach
/// from. Sequence numbers are not handles: they are how the model is asked to
/// say which objective it means.
fn is_bookkeeping(name: &str) -> bool {
    name == "id"
        || name == "sha256"
        // A figure's file on disk is a handle like any other. Shown it, the
        // model listed ebw-jss1-01-007.png among the instructional materials a teacher
        // should bring to class; the caption and alt text say what it is.
        || name == "assetFileName"
        || name.ends_with("Id")
        || name.ends_with("Ids")
        || name.ends_with("Sha256")
        || name.ends_with("Digest")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_figure_is_described_never_named_by_its_file() {
        let view = without_bookkeeping(&json!({
            "figures": [{
                "assetFileName": "ebw-jss1-01-007.png",
                "caption": "A place-value chart",
                "altText": "Columns labelled millions, thousands, units"
            }]
        }));

        let figure = &view["figures"][0];
        assert!(
            figure.get("assetFileName").is_none(),
            "the file name is a handle"
        );
        assert_eq!(figure["caption"], "A place-value chart");
        assert_eq!(
            figure["altText"],
            "Columns labelled millions, thousands, units"
        );
    }

    #[test]
    fn removes_handles_and_digests_but_keeps_what_is_taught() {
        let view = without_bookkeeping(&json!({
            "id": "lesson-1",
            "topic": "Ordering fractions",
            "curriculumSnapshot": {
                "packageId": "pkg-1",
                "packageSha256": "abc",
                "knowledgeComponents": [
                    {
                        "id": "knowledge-1",
                        "statement": "Compare unlike fractions.",
                        "supportingRecordIds": ["record-1"]
                    }
                ]
            }
        }));

        assert_eq!(
            view,
            json!({
                "topic": "Ordering fractions",
                "curriculumSnapshot": {
                    "knowledgeComponents": [
                        { "statement": "Compare unlike fractions." }
                    ]
                }
            })
        );
    }

    #[test]
    fn keeps_the_sequence_numbers_the_model_answers_with() {
        let view = without_bookkeeping(&json!({
            "lessonObjectiveSequence": 2,
            "candidateSequence": 1,
            "lessonObjectiveId": "objective-2"
        }));

        assert_eq!(
            view,
            json!({ "lessonObjectiveSequence": 2, "candidateSequence": 1 })
        );
    }
}
