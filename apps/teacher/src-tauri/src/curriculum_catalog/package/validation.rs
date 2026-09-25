use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::content_rights::{ContentRightsBasis, ContentRightsKind};

use super::content_validation::validate_course;
use super::field_format::{http_url, identifier, optional_date, required_text, sha256};
use super::model::{
    CurriculumPackageIntegrity, CurriculumPackageLicence, CurriculumPackagePayload,
    CurriculumSourceTargetKind,
};

const MAX_COURSES: usize = 100;

pub(super) fn validate_payload(
    mut payload: CurriculumPackagePayload,
    schema_version: i64,
) -> Result<CurriculumPackagePayload, String> {
    payload.package_id = identifier(&payload.package_id, "package identifier", 160)?;
    payload.title = required_text(&payload.title, "curriculum title", 200)?;
    payload.publisher = required_text(&payload.publisher, "publisher", 160)?;
    payload.country_code = identifier(&payload.country_code, "country code", 2)?.to_uppercase();
    if payload.country_code.len() != 2
        || !payload
            .country_code
            .chars()
            .all(|character| character.is_ascii_alphabetic())
    {
        return Err("The curriculum country code must contain two letters.".to_owned());
    }
    payload.jurisdiction_code = identifier(&payload.jurisdiction_code, "jurisdiction code", 40)?;
    payload.edition = required_text(&payload.edition, "edition", 80)?;
    payload.source_url = http_url(&payload.source_url, "curriculum source")?;
    payload.source_sha256 = sha256(&payload.source_sha256, "source digest")?;
    payload.dataset_sha256 = match (schema_version, payload.dataset_sha256.as_deref()) {
        (1, None) => None,
        (1, Some(_)) => {
            return Err("A version 1 curriculum file cannot contain a dataset digest.".to_owned())
        }
        (2, Some(value)) => Some(sha256(value, "dataset digest")?),
        (2, None) => {
            return Err("A version 2 curriculum file must contain a dataset digest.".to_owned())
        }
        _ => unreachable!("schema version checked before payload validation"),
    };
    payload.revision_overlay_sha256 =
        match (schema_version, payload.revision_overlay_sha256.as_deref()) {
            (1, None) => None,
            (1, Some(_)) => {
                return Err(
                    "A version 1 curriculum file cannot contain a revision-overlay digest."
                        .to_owned(),
                )
            }
            (2, Some(value)) => Some(sha256(value, "revision-overlay digest")?),
            (2, None) => None,
            _ => unreachable!("schema version checked before payload validation"),
        };
    payload.modification_notice =
        required_text(&payload.modification_notice, "modification notice", 1_000)?;
    validate_rights(&mut payload, schema_version)?;
    payload.framework.name = required_text(&payload.framework.name, "framework name", 200)?;
    payload.framework.authority =
        required_text(&payload.framework.authority, "framework authority", 160)?;
    payload.effective_from = optional_date(payload.effective_from.as_deref(), "effective from")?;
    payload.effective_to = optional_date(payload.effective_to.as_deref(), "effective to")?;
    if let (Some(from), Some(to)) = (&payload.effective_from, &payload.effective_to) {
        if to < from {
            return Err(
                "The curriculum effective end date cannot precede its start date.".to_owned(),
            );
        }
    }

    if payload.node_kinds.is_empty() || payload.node_kinds.len() > 32 {
        return Err("A curriculum file must declare between 1 and 32 hierarchy types.".to_owned());
    }
    let mut kinds = HashSet::new();
    for kind in &mut payload.node_kinds {
        *kind = identifier(kind, "hierarchy type", 40)?.to_lowercase();
        if !kinds.insert(kind.clone()) {
            return Err("Curriculum hierarchy types must be unique.".to_owned());
        }
    }
    if payload.courses.is_empty() || payload.courses.len() > MAX_COURSES {
        return Err("A curriculum file must contain between 1 and 100 courses.".to_owned());
    }

    let mut course_keys = HashSet::new();
    for course in &mut payload.courses {
        course.course_key = identifier(&course.course_key, "course identifier", 120)?;
        if !course_keys.insert(course.course_key.clone()) {
            return Err("Curriculum course identifiers must be unique.".to_owned());
        }
        validate_course(course, &kinds, schema_version)?;
    }
    validate_integrity(&payload, schema_version)?;
    Ok(payload)
}

fn validate_rights(
    payload: &mut CurriculumPackagePayload,
    schema_version: i64,
) -> Result<(), String> {
    if schema_version == 1 {
        if payload.rights_basis.is_some() || payload.attribution.is_some() {
            return Err(
                "A version 1 curriculum file cannot contain version 2 rights fields.".to_owned(),
            );
        }
        let licence = payload
            .licence
            .as_mut()
            .ok_or_else(|| "A version 1 curriculum file must identify its licence.".to_owned())?;
        validate_licence(licence)?;
        let attribution = required_text(
            licence.attribution.as_deref().ok_or_else(|| {
                "A version 1 curriculum file must contain its attribution.".to_owned()
            })?,
            "attribution",
            2_000,
        )?;
        licence.attribution = Some(attribution.clone());
        payload.attribution = Some(attribution.clone());
        payload.rights_basis = Some(ContentRightsBasis {
            kind: ContentRightsKind::Licence,
            name: licence.name.clone(),
            statement: attribution,
            url: licence.url.clone(),
        });
        return Ok(());
    }

    payload.attribution = Some(required_text(
        payload.attribution.as_deref().ok_or_else(|| {
            "A version 2 curriculum file must contain its attribution.".to_owned()
        })?,
        "attribution",
        2_000,
    )?);
    let rights_basis = payload
        .rights_basis
        .take()
        .ok_or_else(|| "A version 2 curriculum file must identify its rights basis.".to_owned())?
        .validate()?;
    match rights_basis.kind {
        ContentRightsKind::Licence => {
            let licence = payload.licence.as_mut().ok_or_else(|| {
                "A curriculum distributed under a licence must identify that licence.".to_owned()
            })?;
            if licence.attribution.is_some() {
                return Err(
                    "A version 2 curriculum file must keep attribution outside the licence object."
                        .to_owned(),
                );
            }
            validate_licence(licence)?;
            if rights_basis.name != licence.name || rights_basis.url != licence.url {
                return Err("The curriculum rights basis must match its named licence.".to_owned());
            }
        }
        _ if payload.licence.is_some() => {
            return Err(
                "A curriculum without a licence must not contain a licence object.".to_owned(),
            )
        }
        _ => {}
    }
    payload.rights_basis = Some(rights_basis);
    Ok(())
}

fn validate_licence(licence: &mut CurriculumPackageLicence) -> Result<(), String> {
    licence.id = identifier(&licence.id, "licence identifier", 120)?;
    licence.name = required_text(&licence.name, "licence name", 200)?;
    licence.url = http_url(&licence.url, "licence address")?;
    Ok(())
}

fn validate_integrity(
    payload: &CurriculumPackagePayload,
    schema_version: i64,
) -> Result<(), String> {
    if schema_version == 1 {
        if payload.integrity.is_some() {
            return Err("A version 1 curriculum file cannot contain integrity counts.".to_owned());
        }
        return Ok(());
    }
    let integrity = payload
        .integrity
        .as_ref()
        .ok_or_else(|| "A version 2 curriculum file must contain integrity counts.".to_owned())?;
    let nodes = payload
        .courses
        .iter()
        .flat_map(|course| &course.nodes)
        .collect::<Vec<_>>();
    let objectives = payload
        .courses
        .iter()
        .flat_map(|course| &course.objectives)
        .collect::<Vec<_>>();
    let components = payload
        .courses
        .iter()
        .flat_map(|course| &course.knowledge_components)
        .collect::<Vec<_>>();
    let source_links = payload
        .courses
        .iter()
        .flat_map(|course| &course.source_links)
        .count();
    let covered_objectives = payload
        .courses
        .iter()
        .flat_map(|course| {
            course.source_links.iter().filter_map(|link| {
                (link.target_kind == CurriculumSourceTargetKind::Objective)
                    .then_some((course.course_key.as_str(), link.target_code.as_str()))
            })
        })
        .collect::<HashSet<_>>()
        .len();
    let mut sourced_subtopics = HashSet::new();
    for course in &payload.courses {
        let nodes = course
            .nodes
            .iter()
            .map(|node| {
                (
                    node.code.as_str(),
                    (node.kind.as_str(), node.parent_code.as_deref()),
                )
            })
            .collect::<HashMap<_, _>>();
        let objective_nodes = course
            .objectives
            .iter()
            .map(|objective| (objective.code.as_str(), objective.node_code.as_str()))
            .collect::<HashMap<_, _>>();
        for link in &course.source_links {
            let node_code = match link.target_kind {
                CurriculumSourceTargetKind::Node => Some(link.target_code.as_str()),
                CurriculumSourceTargetKind::Objective => {
                    objective_nodes.get(link.target_code.as_str()).copied()
                }
            };
            if let Some(subtopic_code) =
                node_code.and_then(|code| ancestor_of_kind(code, "subtopic", &nodes))
            {
                sourced_subtopics.insert((course.course_key.as_str(), subtopic_code));
            }
        }
    }
    let subtopics_with_sources = sourced_subtopics.len();
    let actual = (
        nodes.iter().filter(|node| node.kind == "theme").count(),
        nodes.iter().filter(|node| node.kind == "topic").count(),
        nodes.iter().filter(|node| node.kind == "subtopic").count(),
        nodes
            .iter()
            .filter(|node| node.kind == "performance_objective")
            .count(),
        objectives.len(),
        components.len(),
        source_links,
        covered_objectives,
    );
    let declared = (
        integrity.themes,
        integrity.topics,
        integrity.subtopics,
        integrity.performance_objectives,
        integrity.atomic_objectives,
        integrity.knowledge_components,
        integrity.source_links,
        integrity.atomic_objectives_with_sources,
    );
    if actual != declared
        || integrity.atomic_objectives_without_sources
            != objectives.len().saturating_sub(covered_objectives)
        || integrity.subtopics_with_sources != subtopics_with_sources
        || integrity.subtopics_without_sources
            != integrity.subtopics.saturating_sub(subtopics_with_sources)
        || integrity.linkage_states.values().sum::<usize>() != integrity.subtopics
    {
        return Err("Curriculum integrity counts do not match the package content.".to_owned());
    }
    validate_revision_alignment(payload, integrity)?;
    Ok(())
}

fn validate_revision_alignment(
    payload: &CurriculumPackagePayload,
    integrity: &CurriculumPackageIntegrity,
) -> Result<(), String> {
    if payload.revision_overlay_sha256.is_none() {
        if integrity.source_topics != 0
            || integrity.source_pages != 0
            || integrity.source_link_corrections != 0
            || integrity.golden_lessons != 0
        {
            return Err("Curriculum revision counts require a revision-overlay digest.".to_owned());
        }
        return Ok(());
    }
    if integrity.source_topics == 0 || integrity.source_pages == 0 {
        return Err(
            "A revised curriculum package must identify its source topics and pages.".to_owned(),
        );
    }
    if integrity.golden_lessons
        > integrity
            .linkage_states
            .get("mapped")
            .copied()
            .unwrap_or_default()
    {
        return Err("Golden lessons must be included in the mapped review count.".to_owned());
    }

    let mut source_topics: HashSet<&str> = HashSet::new();
    let mut physical_pages: HashSet<u64> = HashSet::new();
    let mut aligned_planning_topics = 0_usize;
    for node in payload
        .courses
        .iter()
        .flat_map(|course| course.nodes.iter())
        .filter(|node| node.kind == "topic")
    {
        let alignment = node
            .source_payload
            .get("curriculumAlignment")
            .and_then(Value::as_object)
            .ok_or_else(|| {
                "Every planning topic in a revised package must identify its source topic."
                    .to_owned()
            })?;
        let source_topic = alignment
            .get("sourceTopicCode")
            .and_then(Value::as_str)
            .ok_or_else(|| "A curriculum alignment is missing its source-topic code.".to_owned())?;
        source_topics.insert(source_topic);
        let pages = alignment
            .get("physicalPageNumbers")
            .and_then(Value::as_array)
            .ok_or_else(|| "A curriculum alignment is missing its source pages.".to_owned())?;
        if pages.is_empty() {
            return Err("A curriculum alignment must contain a source page.".to_owned());
        }
        for page in pages.iter() {
            let page_number = page.as_u64().filter(|page| *page > 0).ok_or_else(|| {
                "Curriculum-alignment source pages must be positive integers.".to_owned()
            })?;
            physical_pages.insert(page_number);
        }
        aligned_planning_topics += 1;
    }
    if source_topics.len() != integrity.source_topics
        || physical_pages.len() != integrity.source_pages
        || aligned_planning_topics != integrity.topics
    {
        return Err("Curriculum revision counts do not match the source mappings.".to_owned());
    }
    Ok(())
}

fn ancestor_of_kind<'a>(
    node_code: &'a str,
    kind: &str,
    nodes: &HashMap<&'a str, (&'a str, Option<&'a str>)>,
) -> Option<&'a str> {
    let mut cursor = Some(node_code);
    while let Some(code) = cursor {
        let (node_kind, parent_code) = nodes.get(code)?;
        if *node_kind == kind {
            return Some(code);
        }
        cursor = *parent_code;
    }
    None
}
