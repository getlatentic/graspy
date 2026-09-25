use std::collections::{HashMap, HashSet, VecDeque};

use super::field_format::{identifier, optional_text, required_text};
use super::model::{
    CurriculumPackageCourse, CurriculumPackageKnowledgeComponent, CurriculumPackagePrerequisite,
    CurriculumPackageSourceLink, CurriculumSourceTargetKind,
};

const MAX_NODES_PER_COURSE: usize = 20_000;
const MAX_OBJECTIVES_PER_COURSE: usize = 50_000;
const MAX_COMPONENTS_PER_COURSE: usize = 50_000;
const MAX_CURRICULUM_CODE_CHARS: usize = 160;

pub(super) fn validate_course(
    course: &mut CurriculumPackageCourse,
    declared_kinds: &HashSet<String>,
    schema_version: i64,
) -> Result<(), String> {
    course.title = required_text(&course.title, "course title", 200)?;
    course.subject = required_text(&course.subject, "subject", 120)?;
    course.grade_system_code = identifier(&course.grade_system_code, "grade system code", 80)?;
    course.grade_system_version =
        required_text(&course.grade_system_version, "grade system version", 80)?;
    course.grade_level_code = identifier(&course.grade_level_code, "grade level code", 40)?;
    if course.nodes.is_empty() || course.nodes.len() > MAX_NODES_PER_COURSE {
        return Err(
            "Each curriculum course must contain between 1 and 20,000 hierarchy entries."
                .to_owned(),
        );
    }
    if course.objectives.is_empty() || course.objectives.len() > MAX_OBJECTIVES_PER_COURSE {
        return Err(
            "Each curriculum course must contain between 1 and 50,000 learning objectives."
                .to_owned(),
        );
    }
    if course.knowledge_components.is_empty()
        || course.knowledge_components.len() > MAX_COMPONENTS_PER_COURSE
    {
        return Err(
            "Each curriculum course must contain between 1 and 50,000 knowledge components."
                .to_owned(),
        );
    }

    let mut node_codes = HashSet::new();
    let mut node_parents = HashMap::new();
    let mut sibling_sequences = HashSet::new();
    for node in &mut course.nodes {
        node.code = identifier(
            &node.code,
            "curriculum entry code",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        node.kind = identifier(&node.kind, "curriculum hierarchy type", 40)?.to_lowercase();
        if !declared_kinds.contains(&node.kind) {
            return Err(format!(
                "Curriculum entry {} uses an undeclared hierarchy type.",
                node.code
            ));
        }
        node.title = required_text(&node.title, "curriculum entry title", 300)?;
        node.statement = optional_text(node.statement.as_deref(), 4_000)?;
        if node.sequence < 1 {
            return Err("Curriculum entry order must start at 1.".to_owned());
        }
        if let Some(parent_code) = &mut node.parent_code {
            *parent_code = identifier(
                parent_code,
                "parent curriculum entry",
                MAX_CURRICULUM_CODE_CHARS,
            )?;
            if !node_codes.contains(parent_code) {
                return Err(format!(
                    "Curriculum entry {} must follow its parent {}.",
                    node.code, parent_code
                ));
            }
        }
        if !sibling_sequences.insert((node.parent_code.clone(), node.sequence)) {
            return Err(
                "Curriculum entries under one parent must have unique order numbers.".to_owned(),
            );
        }
        if !node_codes.insert(node.code.clone()) {
            return Err("Curriculum entry codes must be unique within a course.".to_owned());
        }
        node_parents.insert(node.code.clone(), node.parent_code.clone());
        if !node.source_payload.is_object() {
            return Err("Each curriculum entry source payload must be a JSON object.".to_owned());
        }
    }

    let mut objective_codes = HashSet::new();
    let mut objective_nodes = HashMap::new();
    let mut objective_sequences = HashSet::new();
    for objective in &mut course.objectives {
        objective.code = identifier(
            &objective.code,
            "learning objective code",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        objective.node_code = identifier(
            &objective.node_code,
            "curriculum entry code",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        if !node_codes.contains(&objective.node_code) {
            return Err(format!(
                "Learning objective {} refers to an unknown curriculum entry.",
                objective.code
            ));
        }
        objective.statement = required_text(&objective.statement, "learning objective", 2_000)?;
        objective.bloom_verb = optional_text(objective.bloom_verb.as_deref(), 80)?;
        objective.bloom_level = optional_text(objective.bloom_level.as_deref(), 20)?;
        if objective.bloom_level.as_deref().is_some_and(|level| {
            !matches!(
                level,
                "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create"
            )
        }) {
            return Err("A learning objective uses an unsupported Bloom level.".to_owned());
        }
        if objective.sequence < 1
            || !objective_sequences.insert((objective.node_code.clone(), objective.sequence))
        {
            return Err("Learning objectives under one curriculum entry need unique positive order numbers."
                .to_owned());
        }
        if !objective_codes.insert(objective.code.clone()) {
            return Err("Learning objective codes must be unique within a course.".to_owned());
        }
        objective_nodes.insert(objective.code.clone(), objective.node_code.clone());
    }

    let mut component_codes = HashSet::new();
    for component in &mut course.knowledge_components {
        component.code = identifier(
            &component.code,
            "knowledge component code",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        component.description =
            required_text(&component.description, "knowledge component", 2_000)?;
        validate_component(
            component,
            schema_version,
            &node_codes,
            &node_parents,
            &objective_nodes,
        )?;
        if !component_codes.insert(component.code.clone()) {
            return Err("Knowledge component codes must be unique within a course.".to_owned());
        }
    }
    reject_goals_nothing_teaches(course)?;
    validate_prerequisites(&mut course.prerequisites, &component_codes)?;
    validate_source_links(
        &mut course.source_links,
        &mut course.uncovered_objective_codes,
        schema_version,
        &node_codes,
        &objective_codes,
    )
}

/// Refuse a course that cannot teach a goal it lists.
///
/// Every component names the goals it serves, and each of those is checked to
/// exist. Nothing checked the other direction, so a goal no component reaches
/// installed cleanly and failed later, at the moment a teacher tried to prepare
/// a lesson from it — a shipped library was found in exactly that state, where
/// all 98 goals reachable from the scheme of work were unteachable.
///
/// A course is refused whole rather than installed partially: a scheme of work
/// is written against the goals a course promises, so dropping the unteachable
/// ones would leave a plan pointing at goals that no longer exist.
fn reject_goals_nothing_teaches(course: &CurriculumPackageCourse) -> Result<(), String> {
    let taught = course
        .knowledge_components
        .iter()
        .flat_map(|component| component.objective_codes.iter())
        .collect::<HashSet<_>>();
    let untaught = course
        .objectives
        .iter()
        .filter(|objective| !taught.contains(&objective.code))
        .collect::<Vec<_>>();
    let Some(first) = untaught.first() else {
        return Ok(());
    };
    // Named by what it asks a learner to do, because the code identifies it to
    // the publisher and the statement identifies it to everyone else.
    let others = match untaught.len() - 1 {
        0 => String::new(),
        1 => ", and 1 other learning goal".to_owned(),
        count => format!(", and {count} other learning goals"),
    };
    Err(format!(
        "This curriculum cannot teach every learning goal it lists. Nothing in it \
         covers “{}”{others}. Ask whoever published it for a complete file.",
        first.statement
    ))
}

fn validate_component(
    component: &mut CurriculumPackageKnowledgeComponent,
    schema_version: i64,
    node_codes: &HashSet<String>,
    node_parents: &HashMap<String, Option<String>>,
    objective_nodes: &HashMap<String, String>,
) -> Result<(), String> {
    match schema_version {
        1 => {
            if component.node_code.is_some()
                || !component.objective_codes.is_empty()
                || component.bloom_level.is_some()
            {
                return Err(
                    "A version 1 knowledge component uses version 2 alignment fields.".to_owned(),
                );
            }
            let objective_code = component.objective_code.as_mut().ok_or_else(|| {
                "A version 1 knowledge component must identify one learning objective.".to_owned()
            })?;
            *objective_code = identifier(
                objective_code,
                "learning objective code",
                MAX_CURRICULUM_CODE_CHARS,
            )?;
            let node_code = objective_nodes.get(objective_code).ok_or_else(|| {
                format!(
                    "Knowledge component {} refers to an unknown learning objective.",
                    component.code
                )
            })?;
            component.node_code = Some(node_code.clone());
            component.objective_codes = vec![objective_code.clone()];
            let knowledge_type = component.knowledge_type.as_mut().ok_or_else(|| {
                "A version 1 knowledge component must identify its knowledge type.".to_owned()
            })?;
            *knowledge_type = validate_knowledge_type(knowledge_type)?;
        }
        2 => {
            if component.objective_code.is_some() {
                return Err(
                    "A version 2 knowledge component must use its curriculum node and objective alignments."
                        .to_owned(),
                );
            }
            let node_code = component.node_code.as_mut().ok_or_else(|| {
                "A version 2 knowledge component must identify its curriculum entry.".to_owned()
            })?;
            *node_code = identifier(
                node_code,
                "curriculum entry code",
                MAX_CURRICULUM_CODE_CHARS,
            )?;
            if !node_codes.contains(node_code) {
                return Err(format!(
                    "Knowledge component {} refers to an unknown curriculum entry.",
                    component.code
                ));
            }
            let mut alignments = HashSet::new();
            for objective_code in &mut component.objective_codes {
                *objective_code = identifier(
                    objective_code,
                    "learning objective code",
                    MAX_CURRICULUM_CODE_CHARS,
                )?;
                let objective_node = objective_nodes.get(objective_code).ok_or_else(|| {
                    format!(
                        "Knowledge component {} refers to an unknown learning objective.",
                        component.code
                    )
                })?;
                if !node_is_descendant(objective_node, node_code, node_parents) {
                    return Err(format!(
                        "Knowledge component {} has an objective outside its curriculum entry.",
                        component.code
                    ));
                }
                if !alignments.insert(objective_code.clone()) {
                    return Err(
                        "Knowledge-component objective alignments must be unique.".to_owned()
                    );
                }
            }
            let bloom_level = component.bloom_level.as_mut().ok_or_else(|| {
                "A version 2 knowledge component must identify its Bloom level.".to_owned()
            })?;
            *bloom_level = identifier(bloom_level, "Bloom level", 20)?.to_lowercase();
            if !is_bloom_level(bloom_level) {
                return Err("A knowledge component uses an unsupported Bloom level.".to_owned());
            }
            if let Some(knowledge_type) = &mut component.knowledge_type {
                *knowledge_type = validate_knowledge_type(knowledge_type)?;
            }
        }
        _ => unreachable!("schema version checked before course validation"),
    }
    Ok(())
}

fn node_is_descendant(
    node_code: &str,
    ancestor_code: &str,
    node_parents: &HashMap<String, Option<String>>,
) -> bool {
    let mut cursor = Some(node_code);
    while let Some(code) = cursor {
        if code == ancestor_code {
            return true;
        }
        cursor = node_parents.get(code).and_then(Option::as_deref);
    }
    false
}

fn validate_knowledge_type(value: &str) -> Result<String, String> {
    let value = identifier(value, "knowledge type", 40)?.to_lowercase();
    if !matches!(value.as_str(), "concept" | "procedure" | "representation") {
        return Err("A knowledge component uses an unsupported knowledge type.".to_owned());
    }
    Ok(value)
}

fn is_bloom_level(value: &str) -> bool {
    matches!(
        value,
        "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create"
    )
}

fn validate_prerequisites(
    prerequisites: &mut [CurriculumPackagePrerequisite],
    component_codes: &HashSet<String>,
) -> Result<(), String> {
    let mut edges = HashSet::new();
    let mut indegree = component_codes
        .iter()
        .map(|code| (code.clone(), 0_usize))
        .collect::<HashMap<_, _>>();
    let mut dependants = HashMap::<String, Vec<String>>::new();
    for prerequisite in prerequisites {
        prerequisite.component_code = identifier(
            &prerequisite.component_code,
            "knowledge component code",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        prerequisite.prerequisite_code = identifier(
            &prerequisite.prerequisite_code,
            "prerequisite code",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        if prerequisite.component_code == prerequisite.prerequisite_code {
            return Err("A knowledge component cannot require itself.".to_owned());
        }
        if !component_codes.contains(&prerequisite.component_code)
            || !component_codes.contains(&prerequisite.prerequisite_code)
        {
            return Err("A prerequisite refers to an unknown knowledge component.".to_owned());
        }
        if !edges.insert((
            prerequisite.component_code.clone(),
            prerequisite.prerequisite_code.clone(),
        )) {
            return Err("Knowledge-component prerequisites must be unique.".to_owned());
        }
        *indegree
            .get_mut(&prerequisite.component_code)
            .expect("validated component") += 1;
        dependants
            .entry(prerequisite.prerequisite_code.clone())
            .or_default()
            .push(prerequisite.component_code.clone());
    }
    let mut ready = indegree
        .iter()
        .filter_map(|(code, degree)| (*degree == 0).then_some(code.clone()))
        .collect::<VecDeque<_>>();
    let mut visited = 0;
    while let Some(code) = ready.pop_front() {
        visited += 1;
        for dependant in dependants.get(&code).into_iter().flatten() {
            let degree = indegree.get_mut(dependant).expect("validated dependant");
            *degree -= 1;
            if *degree == 0 {
                ready.push_back(dependant.clone());
            }
        }
    }
    if visited != component_codes.len() {
        return Err("Knowledge-component prerequisites must not contain a cycle.".to_owned());
    }
    Ok(())
}

fn validate_source_links(
    links: &mut [CurriculumPackageSourceLink],
    uncovered_objective_codes: &mut [String],
    schema_version: i64,
    node_codes: &HashSet<String>,
    objective_codes: &HashSet<String>,
) -> Result<(), String> {
    if schema_version == 1 {
        if !links.is_empty() || !uncovered_objective_codes.is_empty() {
            return Err("A version 1 curriculum file cannot contain source links.".to_owned());
        }
        return Ok(());
    }
    let mut unique_links = HashSet::new();
    let mut target_sequences = HashSet::new();
    let mut covered_objectives = HashSet::new();
    for link in links {
        link.target_code = identifier(
            &link.target_code,
            "source-link target",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        link.record_id = identifier(&link.record_id, "textbook record", 160)?;
        link.role = identifier(&link.role, "source-link role", 40)?.to_lowercase();
        if !matches!(
            link.role.as_str(),
            "foundation" | "instruction" | "worked_example" | "exercise"
        ) {
            return Err("A curriculum source link uses an unsupported role.".to_owned());
        }
        link.method = required_text(&link.method, "source-link method", 80)?;
        link.rationale = required_text(&link.rationale, "source-link rationale", 2_000)?;
        if link.sequence < 1 {
            return Err("Curriculum source-link order must start at 1.".to_owned());
        }
        let target_exists = match link.target_kind {
            CurriculumSourceTargetKind::Node => node_codes.contains(&link.target_code),
            CurriculumSourceTargetKind::Objective => {
                let exists = objective_codes.contains(&link.target_code);
                if exists {
                    covered_objectives.insert(link.target_code.clone());
                }
                exists
            }
        };
        if !target_exists {
            return Err("A curriculum source link refers to an unknown target.".to_owned());
        }
        if !unique_links.insert((
            link.target_kind,
            link.target_code.clone(),
            link.record_id.clone(),
        )) {
            return Err("Curriculum source links must be unique.".to_owned());
        }
        if !target_sequences.insert((link.target_kind, link.target_code.clone(), link.sequence)) {
            return Err("Curriculum source-link order must be unique for each target.".to_owned());
        }
    }

    let mut uncovered = HashSet::new();
    for objective_code in uncovered_objective_codes {
        *objective_code = identifier(
            objective_code,
            "uncovered objective",
            MAX_CURRICULUM_CODE_CHARS,
        )?;
        if !objective_codes.contains(objective_code) {
            return Err("The uncovered-objective list refers to an unknown objective.".to_owned());
        }
        if !uncovered.insert(objective_code.clone()) {
            return Err("Uncovered learning objectives must be unique.".to_owned());
        }
    }
    let expected = objective_codes
        .difference(&covered_objectives)
        .cloned()
        .collect::<HashSet<_>>();
    if uncovered != expected {
        return Err(
            "The uncovered-objective list must exactly match objectives without textbook links."
                .to_owned(),
        );
    }
    Ok(())
}
