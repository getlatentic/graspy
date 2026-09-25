use std::collections::{BTreeMap, BTreeSet};

use super::model::{
    GranularLessonPlan, GranularLessonRecord, KnowledgeComponent, KnowledgeType,
    LessonContentBlock, LessonObjective, LessonPlanStep, LessonStepRole, SourceEvidenceSnapshot,
};
use super::structure_validation::{
    unique_ids, valid_id, validate_asset_file_name, validate_curriculum, validate_evidence,
    validate_knowledge_links, validate_prerequisite_graph, validate_program_snapshot,
    validate_sequence, validate_sha256, validate_source_links, validate_text,
};
use crate::lesson_planning::mathematics::{
    validate_fraction_ordering_hints, validate_fraction_ordering_practice,
    validate_fraction_ordering_worked_example,
};

impl GranularLessonRecord {
    pub fn validate_complete(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();
        validate_text(&self.plan.topic, "lesson topic", 160, &mut errors);
        if self.plan.schema_version != 1 {
            errors.push("The lesson uses an unsupported detailed-plan version.".to_owned());
        }
        validate_program_snapshot(&self.program_snapshot, &mut errors);
        validate_curriculum(&self.plan, &self.curriculum_snapshot, &mut errors);
        validate_evidence(&self.source_evidence_snapshot, &mut errors);
        validate_plan(&self.plan, &self.source_evidence_snapshot, &mut errors);
        errors.sort();
        errors.dedup();
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

fn validate_plan(
    plan: &GranularLessonPlan,
    evidence: &SourceEvidenceSnapshot,
    errors: &mut Vec<String>,
) {
    if plan.curriculum_objectives.is_empty() {
        errors.push("Select at least one curriculum objective for this lesson.".to_owned());
    }
    if plan.atomic_objectives.is_empty() {
        errors.push("The lesson needs at least one focused objective.".to_owned());
    }
    if plan.lesson_objectives.is_empty() {
        errors.push("Add at least one lesson objective.".to_owned());
    }
    if plan.knowledge_components.is_empty() {
        errors.push("The lesson needs a knowledge plan.".to_owned());
    }
    if plan.instructional_materials.is_empty() {
        errors.push("Add at least one teaching material.".to_owned());
    }
    if plan.assessments.is_empty() {
        errors.push("Add at least one objective-aligned assessment.".to_owned());
    }

    validate_sequence(
        plan.curriculum_objectives
            .iter()
            .map(|value| value.sequence),
        "curriculum objectives",
        errors,
    );
    validate_sequence(
        plan.atomic_objectives.iter().map(|value| value.sequence),
        "focused objectives",
        errors,
    );
    validate_sequence(
        plan.lesson_objectives.iter().map(|value| value.sequence),
        "lesson objectives",
        errors,
    );
    validate_sequence(
        plan.steps.iter().map(|value| value.sequence),
        "lesson steps",
        errors,
    );

    let curriculum_ids = unique_ids(
        plan.curriculum_objectives
            .iter()
            .map(|value| value.id.as_str()),
        "curriculum objective",
        errors,
    );
    let atomic_ids = unique_ids(
        plan.atomic_objectives.iter().map(|value| value.id.as_str()),
        "focused objective",
        errors,
    );
    let knowledge_ids = unique_ids(
        plan.knowledge_components
            .iter()
            .map(|value| value.id.as_str()),
        "knowledge component",
        errors,
    );
    let objective_ids = unique_ids(
        plan.lesson_objectives.iter().map(|value| value.id.as_str()),
        "lesson objective",
        errors,
    );
    unique_ids(
        plan.misconceptions.iter().map(|value| value.id.as_str()),
        "common misunderstanding",
        errors,
    );
    unique_ids(
        plan.prior_knowledge.iter().map(|value| value.id.as_str()),
        "prior-knowledge item",
        errors,
    );
    unique_ids(
        plan.assessments.iter().map(|value| value.id.as_str()),
        "assessment item",
        errors,
    );

    for objective in &plan.curriculum_objectives {
        validate_text(&objective.statement, "curriculum objective", 2_000, errors);
    }
    let atomic_by_id = plan
        .atomic_objectives
        .iter()
        .map(|value| (value.id.as_str(), value))
        .collect::<BTreeMap<_, _>>();
    for objective in &plan.atomic_objectives {
        validate_text(&objective.statement, "focused objective", 2_000, errors);
        validate_text(&objective.bloom_verb, "objective action", 80, errors);
        if !curriculum_ids.contains(&objective.curriculum_objective_id) {
            errors.push("A focused objective is outside the selected curriculum scope.".to_owned());
        }
    }

    let evidence_ids = evidence
        .records
        .iter()
        .map(|record| record.record_id.as_str())
        .collect::<BTreeSet<_>>();
    let knowledge_by_id = plan
        .knowledge_components
        .iter()
        .map(|value| (value.id.as_str(), value))
        .collect::<BTreeMap<_, _>>();
    for component in &plan.knowledge_components {
        validate_text(&component.description, "knowledge component", 2_000, errors);
        if component.atomic_objective_ids.is_empty()
            || component
                .atomic_objective_ids
                .iter()
                .any(|id| !atomic_ids.contains(id))
        {
            errors.push("A knowledge component is not aligned to a focused objective.".to_owned());
        }
        if component
            .prerequisite_knowledge_component_ids
            .iter()
            .any(|id| id == &component.id || !knowledge_ids.contains(id))
        {
            errors.push("A knowledge prerequisite is invalid.".to_owned());
        }
        if component
            .supporting_record_ids
            .iter()
            .any(|id| !evidence_ids.contains(id.as_str()))
        {
            errors.push(
                "A knowledge component uses source material outside the saved evidence.".to_owned(),
            );
        }
    }
    validate_prerequisite_graph(&plan.knowledge_components, errors);

    for objective in &plan.lesson_objectives {
        validate_text(&objective.statement, "lesson objective", 2_000, errors);
        let Some(atomic) = atomic_by_id.get(objective.atomic_objective_id.as_str()) else {
            errors.push("A lesson objective is not aligned to a focused objective.".to_owned());
            continue;
        };
        if atomic.curriculum_objective_id != objective.curriculum_objective_id
            || !curriculum_ids.contains(&objective.curriculum_objective_id)
        {
            errors.push("A lesson objective is outside the selected curriculum scope.".to_owned());
        }
        let Some(component) = knowledge_by_id.get(objective.knowledge_component_id.as_str()) else {
            errors.push("A lesson objective is missing its knowledge component.".to_owned());
            continue;
        };
        if component.is_prior_knowledge
            || !component
                .atomic_objective_ids
                .contains(&objective.atomic_objective_id)
        {
            errors.push("A lesson objective has an invalid knowledge alignment.".to_owned());
        }
    }

    for misconception in &plan.misconceptions {
        validate_text(
            &misconception.statement,
            "common misunderstanding",
            2_000,
            errors,
        );
        validate_text(
            &misconception.correction,
            "misunderstanding correction",
            2_000,
            errors,
        );
        validate_knowledge_links(
            &misconception.knowledge_component_ids,
            &knowledge_ids,
            "A common misunderstanding",
            errors,
        );
        validate_source_links(
            &misconception.supporting_record_ids,
            &evidence_ids,
            "A common misunderstanding",
            errors,
        );
    }
    for prior in &plan.prior_knowledge {
        validate_text(&prior.statement, "prior knowledge", 2_000, errors);
        validate_knowledge_links(
            &prior.knowledge_component_ids,
            &knowledge_ids,
            "A prior-knowledge item",
            errors,
        );
        if prior.knowledge_component_ids.iter().any(|id| {
            knowledge_by_id
                .get(id.as_str())
                .is_some_and(|component| !component.is_prior_knowledge)
        }) {
            errors.push("A prior-knowledge item refers to new lesson content.".to_owned());
        }
        validate_source_links(
            &prior.supporting_record_ids,
            &evidence_ids,
            "A prior-knowledge item",
            errors,
        );
    }

    let reference_ids = unique_ids(
        plan.references.iter().map(|value| value.record_id.as_str()),
        "lesson reference",
        errors,
    );
    for reference in &plan.references {
        validate_text(&reference.title, "reference title", 500, errors);
        validate_text(
            &reference.attribution,
            "reference attribution",
            1_000,
            errors,
        );
        if !evidence_ids.contains(reference.record_id.as_str()) {
            errors.push("A lesson reference is missing from the saved source evidence.".to_owned());
        }
    }
    for component in &plan.knowledge_components {
        if component
            .supporting_record_ids
            .iter()
            .any(|id| !reference_ids.contains(id))
        {
            errors
                .push("Every source used by the lesson must appear in its references.".to_owned());
        }
    }

    validate_steps(plan, evidence, &objective_ids, &knowledge_by_id, errors);
    validate_assessments(plan, &objective_ids, &knowledge_by_id, errors);
}

fn validate_steps(
    plan: &GranularLessonPlan,
    evidence: &SourceEvidenceSnapshot,
    objective_ids: &BTreeSet<String>,
    knowledge_by_id: &BTreeMap<&str, &KnowledgeComponent>,
    errors: &mut Vec<String>,
) {
    if plan.steps.len() < 3 {
        errors.push(
            "A lesson needs an introduction, one or more core steps, and an evaluation.".to_owned(),
        );
        return;
    }
    let introductions = plan
        .steps
        .iter()
        .filter(|step| step.role == LessonStepRole::Introduction)
        .count();
    let evaluations = plan
        .steps
        .iter()
        .filter(|step| step.role == LessonStepRole::Evaluation)
        .count();
    if introductions != 1
        || plan.steps.first().map(|step| step.role) != Some(LessonStepRole::Introduction)
    {
        errors.push("The lesson must begin with exactly one introduction.".to_owned());
    }
    if evaluations != 1
        || plan.steps.last().map(|step| step.role) != Some(LessonStepRole::Evaluation)
    {
        errors.push("The lesson must end with exactly one evaluation.".to_owned());
    }

    let mut step_ids = BTreeSet::new();
    let mut block_ids = BTreeSet::new();
    let mut core_objectives = BTreeSet::new();
    let mut evaluation_objectives = BTreeSet::new();
    for step in &plan.steps {
        if !valid_id(&step.id) || !step_ids.insert(step.id.as_str()) {
            errors.push("Lesson step references must be unique and non-empty.".to_owned());
        }
        validate_text(&step.title, "lesson step title", 300, errors);
        validate_text(&step.summary, "lesson step summary", 2_000, errors);
        if !(1..=240).contains(&step.duration_minutes) {
            errors.push("Keep each lesson step between 1 and 240 minutes.".to_owned());
        }
        if step.teacher_activities.is_empty() || step.learner_activities.is_empty() {
            errors.push("Every lesson step must say what the teacher and learners do.".to_owned());
        }
        for activity in step
            .teacher_activities
            .iter()
            .chain(step.learner_activities.iter())
        {
            validate_text(activity, "lesson activity", 2_000, errors);
        }
        if step.blocks.is_empty() {
            errors.push("Every lesson step needs structured teaching content.".to_owned());
        }
        for block in &step.blocks {
            if !valid_id(block.id()) || !block_ids.insert(block.id()) {
                errors.push("Lesson content references must be unique and non-empty.".to_owned());
            }
            validate_block(block, evidence, errors);
        }

        match step.role {
            LessonStepRole::Introduction => {
                if step.lesson_objective_id.is_some() || step.knowledge_type.is_some() {
                    errors.push(
                        "The introduction cannot be assigned to only one lesson objective."
                            .to_owned(),
                    );
                }
                if step.blocks.iter().any(|block| {
                    matches!(
                        block,
                        LessonContentBlock::Practice { .. }
                            | LessonContentBlock::WorkedExample { .. }
                    )
                }) {
                    errors.push(
                        "The introduction may contain explanation or verified visuals only."
                            .to_owned(),
                    );
                }
            }
            LessonStepRole::Core => {
                let Some(objective_id) = step.lesson_objective_id.as_ref() else {
                    errors
                        .push("Every core lesson step must teach one lesson objective.".to_owned());
                    continue;
                };
                if !objective_ids.contains(objective_id) {
                    errors.push(
                        "A core lesson step is not aligned to a lesson objective.".to_owned(),
                    );
                    continue;
                }
                core_objectives.insert(objective_id.to_owned());
                let Some(objective) = plan
                    .lesson_objectives
                    .iter()
                    .find(|value| &value.id == objective_id)
                else {
                    continue;
                };
                let Some(component) =
                    knowledge_by_id.get(objective.knowledge_component_id.as_str())
                else {
                    continue;
                };
                if step.knowledge_type != Some(component.knowledge_type) {
                    errors.push(
                        "A core step must use the knowledge type selected for its objective."
                            .to_owned(),
                    );
                }
                validate_required_blocks(step, component.knowledge_type, objective, errors);
            }
            LessonStepRole::Evaluation => {
                if step.lesson_objective_id.is_some() || step.knowledge_type.is_some() {
                    errors.push("The final evaluation must assess the complete lesson.".to_owned());
                }
                for block in &step.blocks {
                    match block {
                        LessonContentBlock::Practice {
                            lesson_objective_id,
                            ..
                        } => {
                            if !objective_ids.contains(lesson_objective_id) {
                                errors.push(
                                    "Every final-evaluation question must align to a lesson objective."
                                        .to_owned(),
                                );
                            } else {
                                evaluation_objectives.insert(lesson_objective_id.to_owned());
                            }
                        }
                        _ => errors.push(
                            "The final evaluation may contain assessment questions only."
                                .to_owned(),
                        ),
                    }
                }
            }
        }
    }
    if core_objectives != *objective_ids {
        errors.push("Every lesson objective needs at least one core lesson step.".to_owned());
    }
    if evaluation_objectives != *objective_ids {
        errors.push("The final evaluation must assess every lesson objective.".to_owned());
    }
}

fn validate_required_blocks(
    step: &LessonPlanStep,
    knowledge_type: KnowledgeType,
    objective: &LessonObjective,
    errors: &mut Vec<String>,
) {
    let explanations = step
        .blocks
        .iter()
        .filter(|block| matches!(block, LessonContentBlock::Explanation { .. }))
        .count();
    if explanations == 0 {
        errors.push("Every core step needs an explanation.".to_owned());
    }
    if matches!(
        knowledge_type,
        KnowledgeType::Procedure | KnowledgeType::Representation
    ) {
        if !step
            .blocks
            .iter()
            .any(|block| matches!(block, LessonContentBlock::WorkedExample { .. }))
        {
            errors.push("Procedures and representations need a worked example.".to_owned());
        }
        if !step.blocks.iter().any(|block| {
            matches!(block, LessonContentBlock::Practice { lesson_objective_id, .. } if lesson_objective_id == &objective.id)
        }) {
            errors.push("Procedures and representations need aligned practice.".to_owned());
        }
    }
    if step.blocks.iter().any(|block| {
        matches!(block, LessonContentBlock::Practice { lesson_objective_id, .. } if lesson_objective_id != &objective.id)
    }) {
        errors.push("Practice in a core step must assess that step's lesson objective.".to_owned());
    }

    let worked_example_problems = step
        .blocks
        .iter()
        .filter_map(|block| match block {
            LessonContentBlock::WorkedExample {
                problem,
                final_answer,
                ..
            } => {
                if let Err(error) = validate_fraction_ordering_worked_example(
                    &objective.statement,
                    problem,
                    final_answer,
                ) {
                    errors.push(error);
                }
                Some(problem.as_str())
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    for block in &step.blocks {
        if let LessonContentBlock::Practice {
            question,
            expected_answer,
            ..
        } = block
        {
            if let Err(error) = validate_fraction_ordering_practice(
                &objective.statement,
                &worked_example_problems,
                question,
                expected_answer,
            ) {
                errors.push(error);
            }
        }
    }
}

fn validate_block(
    block: &LessonContentBlock,
    evidence: &SourceEvidenceSnapshot,
    errors: &mut Vec<String>,
) {
    match block {
        LessonContentBlock::Explanation { content, .. } => {
            validate_text(content, "explanation", 12_000, errors);
        }
        LessonContentBlock::WorkedExample {
            problem,
            steps,
            final_answer,
            ..
        } => {
            validate_text(problem, "worked-example problem", 4_000, errors);
            validate_text(final_answer, "worked-example answer", 4_000, errors);
            if steps.is_empty() {
                errors.push("A worked example needs at least one explained step.".to_owned());
            }
            for step in steps {
                validate_text(&step.label, "worked-example step label", 160, errors);
                validate_text(&step.content, "worked-example step", 4_000, errors);
            }
        }
        LessonContentBlock::Practice {
            lesson_objective_id,
            question,
            expected_answer,
            hints,
            ..
        } => {
            if !valid_id(lesson_objective_id) {
                errors.push("A practice question is missing its lesson objective.".to_owned());
            }
            validate_text(question, "practice question", 4_000, errors);
            validate_text(expected_answer, "practice answer", 4_000, errors);
            if let Err(error) = validate_fraction_ordering_hints(question, hints) {
                errors.push(error);
            }
            for hint in hints {
                validate_text(hint, "practice hint", 1_000, errors);
            }
        }
        LessonContentBlock::Visual {
            source_record_id,
            asset_file_name,
            figure_sha256,
            caption,
            alt_text,
            ..
        } => {
            validate_asset_file_name(asset_file_name, errors);
            validate_sha256(figure_sha256, "lesson figure", errors);
            validate_text(caption, "figure caption", 1_000, errors);
            validate_text(alt_text, "figure description", 1_000, errors);
            let verified = evidence.figures.iter().any(|figure| {
                figure.source_record_id == *source_record_id
                    && figure.asset_file_name == *asset_file_name
                    && figure.sha256 == *figure_sha256
                    && figure.caption == *caption
                    && figure.alt_text == *alt_text
            });
            if !verified {
                errors.push("A lesson visual does not match a verified source figure.".to_owned());
            }
        }
    }
}

fn validate_assessments(
    plan: &GranularLessonPlan,
    objective_ids: &BTreeSet<String>,
    knowledge_by_id: &BTreeMap<&str, &KnowledgeComponent>,
    errors: &mut Vec<String>,
) {
    let mut assessed = BTreeSet::new();
    let mut assessment_ids = BTreeSet::new();
    for assessment in &plan.assessments {
        if !valid_id(&assessment.id) || !assessment_ids.insert(assessment.id.as_str()) {
            errors.push("Assessment references must be unique and non-empty.".to_owned());
        }
        validate_text(&assessment.question, "assessment question", 4_000, errors);
        validate_text(
            &assessment.expected_answer,
            "assessment answer",
            4_000,
            errors,
        );
        if assessment.rubric.is_empty() {
            errors.push("Every assessment needs at least one marking point.".to_owned());
        }
        for point in &assessment.rubric {
            validate_text(point, "assessment marking point", 1_000, errors);
        }
        if !objective_ids.contains(&assessment.lesson_objective_id) {
            errors.push("An assessment is not aligned to a lesson objective.".to_owned());
            continue;
        }
        assessed.insert(assessment.lesson_objective_id.as_str());
        let aligned = plan.lesson_objectives.iter().any(|objective| {
            objective.id == assessment.lesson_objective_id
                && objective.knowledge_component_id == assessment.knowledge_component_id
                && knowledge_by_id.contains_key(assessment.knowledge_component_id.as_str())
        });
        if !aligned {
            errors.push(
                "An assessment is not aligned to the objective's knowledge component.".to_owned(),
            );
        }
        let supporting_ids = plan
            .references
            .iter()
            .map(|reference| reference.record_id.as_str())
            .collect::<BTreeSet<_>>();
        validate_source_links(
            &assessment.supporting_record_ids,
            &supporting_ids,
            "An assessment",
            errors,
        );
    }
    let expected = objective_ids
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    if assessed != expected {
        errors.push("Every lesson objective needs an aligned assessment.".to_owned());
    }
}
