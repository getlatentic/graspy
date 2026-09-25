use std::collections::{BTreeMap, BTreeSet, VecDeque};

use sha2::{Digest, Sha256};

use super::model::{
    CurriculumSnapshot, GranularLessonPlan, KnowledgeComponent, LessonProgramSnapshot,
    SourceEvidenceSnapshot,
};

pub(super) fn validate_program_snapshot(
    snapshot: &LessonProgramSnapshot,
    errors: &mut Vec<String>,
) {
    validate_text(&snapshot.program_id, "lesson-planning program", 160, errors);
    validate_text(
        &snapshot.program_version,
        "lesson-planning program version",
        40,
        errors,
    );
    validate_sha256(&snapshot.program_digest, "lesson-planning program", errors);
    if snapshot
        .program_run_id
        .as_ref()
        .is_some_and(|value| value.trim().is_empty() || value.len() > 160)
    {
        errors.push("The lesson-planning run reference is invalid.".to_owned());
    }
}

pub(super) fn validate_curriculum(
    plan: &GranularLessonPlan,
    snapshot: &CurriculumSnapshot,
    errors: &mut Vec<String>,
) {
    let named = snapshot
        .provenance_fields()
        .iter()
        .filter(|field| field.is_some())
        .count();
    if named != 0 && named != snapshot.provenance_fields().len() {
        errors.push(
            "This lesson names its curriculum only in part, so its sources cannot be trusted."
                .to_owned(),
        );
    } else if let (Some(package_id), Some(package_title), Some(sha256), Some(course), Some(node)) = (
        snapshot.package_id.as_deref(),
        snapshot.package_title.as_deref(),
        snapshot.package_sha256.as_deref(),
        snapshot.course_id.as_deref(),
        snapshot.curriculum_node_id.as_deref(),
    ) {
        validate_text(package_id, "curriculum package", 160, errors);
        validate_text(package_title, "curriculum title", 300, errors);
        validate_sha256(sha256, "curriculum package", errors);
        validate_text(course, "curriculum course", 160, errors);
        validate_text(node, "curriculum entry", 160, errors);
    }

    if plan.curriculum_objectives != snapshot.objectives {
        errors.push(
            "The lesson objectives no longer match the selected curriculum snapshot.".to_owned(),
        );
    }
    if plan.atomic_objectives != snapshot.atomic_objectives {
        errors.push(
            "The detailed objectives no longer match the selected curriculum snapshot.".to_owned(),
        );
    }
    if plan.knowledge_components != snapshot.knowledge_components {
        errors.push(
            "The lesson knowledge plan no longer matches the selected curriculum snapshot."
                .to_owned(),
        );
    }
}

pub(super) fn validate_evidence(snapshot: &SourceEvidenceSnapshot, errors: &mut Vec<String>) {
    let record_ids = unique_ids(
        snapshot
            .records
            .iter()
            .map(|record| record.record_id.as_str()),
        "source material",
        errors,
    );
    for record in &snapshot.records {
        validate_text(&record.title, "source title", 500, errors);
        validate_text(&record.excerpt, "source excerpt", 20_000, errors);
        validate_text(&record.attribution, "source attribution", 1_000, errors);
        validate_sha256(&record.excerpt_sha256, "source excerpt", errors);
        let actual = format!("{:x}", Sha256::digest(record.excerpt.as_bytes()));
        if actual != record.excerpt_sha256 {
            errors.push(format!(
                "Source material {} failed its integrity check.",
                record.record_id
            ));
        }
    }
    let mut figure_keys = BTreeSet::new();
    for figure in &snapshot.figures {
        let key = (
            figure.source_record_id.as_str(),
            figure.asset_file_name.as_str(),
        );
        if !figure_keys.insert(key) {
            errors.push("A source figure is included more than once.".to_owned());
        }
        if !record_ids.contains(&figure.source_record_id) {
            errors.push("A source figure refers to unavailable source material.".to_owned());
        }
        validate_asset_file_name(&figure.asset_file_name, errors);
        validate_sha256(&figure.sha256, "source figure", errors);
        validate_text(&figure.caption, "figure caption", 1_000, errors);
        validate_text(&figure.alt_text, "figure description", 1_000, errors);
    }
}

pub(super) fn validate_prerequisite_graph(
    components: &[KnowledgeComponent],
    errors: &mut Vec<String>,
) {
    let mut incoming = components
        .iter()
        .map(|component| {
            (
                component.id.as_str(),
                component.prerequisite_knowledge_component_ids.len(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut outgoing = BTreeMap::<&str, Vec<&str>>::new();
    for component in components {
        for prerequisite in &component.prerequisite_knowledge_component_ids {
            outgoing
                .entry(prerequisite.as_str())
                .or_default()
                .push(component.id.as_str());
        }
    }
    let mut ready = incoming
        .iter()
        .filter_map(|(id, count)| (*count == 0).then_some(*id))
        .collect::<VecDeque<_>>();
    let mut visited = 0;
    while let Some(id) = ready.pop_front() {
        visited += 1;
        for dependent in outgoing.get(id).into_iter().flatten() {
            if let Some(count) = incoming.get_mut(dependent) {
                *count -= 1;
                if *count == 0 {
                    ready.push_back(dependent);
                }
            }
        }
    }
    if visited != components.len() {
        errors.push("Knowledge prerequisites must not contain a cycle.".to_owned());
    }
}

pub(super) fn validate_knowledge_links(
    ids: &[String],
    knowledge_ids: &BTreeSet<String>,
    label: &str,
    errors: &mut Vec<String>,
) {
    if ids.is_empty() || ids.iter().any(|id| !knowledge_ids.contains(id)) {
        errors.push(format!("{label} must identify its related knowledge."));
    }
}

pub(super) fn validate_source_links(
    ids: &[String],
    available_ids: &BTreeSet<&str>,
    label: &str,
    errors: &mut Vec<String>,
) {
    if ids.is_empty() || ids.iter().any(|id| !available_ids.contains(id.as_str())) {
        errors.push(format!(
            "{label} must identify the source material that supports it."
        ));
    }
}

pub(super) fn unique_ids<'a>(
    values: impl Iterator<Item = &'a str>,
    label: &str,
    errors: &mut Vec<String>,
) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    for value in values {
        if !valid_id(value) || !ids.insert(value.to_owned()) {
            errors.push(format!(
                "Each {label} reference must be unique and non-empty."
            ));
        }
    }
    ids
}

pub(super) fn validate_sequence(
    values: impl Iterator<Item = u16>,
    label: &str,
    errors: &mut Vec<String>,
) {
    let actual = values.collect::<Vec<_>>();
    let expected = (1..=actual.len())
        .filter_map(|value| u16::try_from(value).ok())
        .collect::<Vec<_>>();
    if actual != expected {
        errors.push(format!("Keep {label} in a complete, unambiguous order."));
    }
}

pub(super) fn validate_text(value: &str, label: &str, max: usize, errors: &mut Vec<String>) {
    let length = value.trim().chars().count();
    if length == 0 || length > max {
        errors.push(format!("Enter a {label} between 1 and {max} characters."));
    }
}

pub(super) fn validate_sha256(value: &str, label: &str, errors: &mut Vec<String>) {
    if value.len() != 64
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        errors.push(format!("The {label} integrity value is invalid."));
    }
}

pub(super) fn validate_asset_file_name(value: &str, errors: &mut Vec<String>) {
    if value.is_empty()
        || value.len() > 255
        || value.contains('/')
        || value.contains('\\')
        || value == "."
        || value == ".."
    {
        errors.push("A lesson figure file name is invalid.".to_owned());
    }
}

pub(super) fn valid_id(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 160
}
