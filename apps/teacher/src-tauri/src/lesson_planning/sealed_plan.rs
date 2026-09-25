//! What a confirmed version says, read from the plan it sealed.
//!
//! A version used to keep topic, subtopic and goals in its own columns beside
//! the seal. The two were written in the same breath and could not honestly
//! disagree — and disagreed anyway, once a migration cleaned one and could not
//! touch the other. Derived here instead, so there is no second copy to drift.
//!
//! The fragments read `lv` as the version and are meant to be interpolated into
//! a query that has already joined it.

/// Brings the sealed plan alongside a `lesson_versions lv` already in the query.
pub(crate) const SEALED_PLAN_JOIN: &str =
    "JOIN lesson_granular_versions sealed ON sealed.lesson_version_id = lv.id";

pub(crate) const SEALED_TOPIC: &str = "json_extract(sealed.plan_json, '$.topic')";

pub(crate) const SEALED_SUBTOPIC: &str = "json_extract(sealed.plan_json, '$.subtopic')";

/// The goals as the screens read them: the statements alone, in the plan's own
/// order, which is the shape the version's column used to hold.
pub(crate) const SEALED_LEARNING_GOALS: &str = "(
        SELECT json_group_array(statement) FROM (
            SELECT json_extract(goal.value, '$.statement') AS statement
            FROM json_each(sealed.plan_json, '$.lessonObjectives') goal
            ORDER BY goal.key
        )
    )";

/// The corpus records the plan cites, which is what grounds the classwork.
///
/// The version used to keep these as "{title} — {attribution}" lines, and the
/// resolver recovered the record from a "(record-id)" suffix those lines did
/// not carry — so every run in the owner's library resolved nothing at all and
/// was written ungrounded, silently. The plan holds the record itself.
pub(crate) const SEALED_SOURCE_RECORD_IDS: &str = "(
        SELECT json_group_array(record_id) FROM (
            SELECT json_extract(cited.value, '$.recordId') AS record_id
            FROM json_each(sealed.plan_json, '$.references') cited
            ORDER BY cited.key
        )
    )";

#[cfg(test)]
pub(crate) mod test_support {
    /// The seal a confirmed version now carries, for a fixture that writes a
    /// version by hand. Written once here so four modules cannot drift on the
    /// shape of the thing they are standing in for.
    pub(crate) fn insert_sealed_plan(
        connection: &rusqlite::Connection,
        version_id: &str,
        topic: &str,
        subtopic: Option<&str>,
        goals: &[&str],
        steps: &[(&str, &str)],
        cites: &[&str],
    ) -> rusqlite::Result<()> {
        let hex = "0".repeat(64);
        let objectives: Vec<serde_json::Value> = goals
            .iter()
            .enumerate()
            .map(|(index, statement)| {
                serde_json::json!({
                    "id": format!("lesson-objective-{}", index + 1),
                    "statement": statement,
                    "sequence": index + 1,
                    "curriculumObjectiveId": "curriculum-objective-1",
                    "atomicObjectiveId": "atomic-objective-1",
                    "knowledgeComponentId": "knowledge-component-1",
                })
            })
            .collect();
        let plan = serde_json::json!({
            "schemaVersion": 1,
            "topic": topic,
            "subtopic": subtopic,
            "curriculumObjectives": [],
            "atomicObjectives": [],
            "lessonObjectives": objectives,
            "knowledgeComponents": [],
            "misconceptions": [],
            "priorKnowledge": [],
            "materials": [],
            "references": cites
                .iter()
                .map(|record_id| {
                    serde_json::json!({
                        "recordId": record_id,
                        "title": format!("Source {record_id}"),
                        "attribution": "Fixture corpus",
                    })
                })
                .collect::<Vec<_>>(),
            "steps": steps
                .iter()
                .enumerate()
                .map(|(index, (title, summary))| {
                    serde_json::json!({
                        "id": format!("lesson-step-{}", index + 1),
                        "sequence": index + 1,
                        "role": "core",
                        "title": title,
                        "summary": summary,
                        "durationMinutes": 15,
                        "lessonObjectiveId": null,
                        "knowledgeType": null,
                        "teacherActivities": [*summary],
                        "learnerActivities": [*summary],
                        "blocks": [],
                    })
                })
                .collect::<Vec<_>>(),
            "assessments": [],
        });
        connection.execute(
            "INSERT INTO lesson_granular_versions (lesson_version_id, plan_json, plan_sha256,
                 curriculum_snapshot_json, curriculum_snapshot_sha256,
                 source_evidence_snapshot_json, source_evidence_snapshot_sha256,
                 program_id, program_version, program_digest)
             VALUES (?1, json(?2), ?3, json('{}'), ?3, json('{}'), ?3, 'program', '1', ?3)",
            rusqlite::params![version_id, plan.to_string(), hex],
        )?;
        Ok(())
    }
}
