//! The class, term and scheme a repository test runs against.
//!
//! Every test here needs a workspace with one class, three terms and a scheme
//! holding a teaching week and a break week — enough for a lesson to be saved
//! against, moved between, and refused from. Building it once and sharing it
//! keeps each test to the one thing it is checking.

use crate::{
    academic_workspace::{
        domain::{CreateAcademicWorkspaceRequest, CreateTeachingAssignment},
        repository::create_workspace,
    },
    db::Database,
    lesson_planning::domain::{
        LessonContextRequest, LessonInputMode, LessonStepInput, SaveLessonDraftRequest,
    },
    scheme_of_work::{
        domain::{
            CreateSchemeOfWorkRequest, SaveSchemeEntryRequest, SaveSchemeWeekRequest,
            SchemeContextRequest, SchemeWeekKind,
        },
        repository::{create_scheme, save_entry, save_week},
    },
};

use super::save_draft;

pub(super) struct TestContext {
    pub(super) database: Database,
    pub(super) lesson_context: LessonContextRequest,
    pub(super) scheme_entry_id: String,
    pub(super) teaching_week_id: String,
    pub(super) break_week_id: String,
    pub(super) second_period_id: String,
}

pub(super) fn setup() -> TestContext {
    let database = Database::in_memory();
    let workspace = create_workspace(
        &database,
        CreateAcademicWorkspaceRequest {
            start_year: 2026,
            jurisdiction_id: "jurisdiction-ng".to_owned(),
            grade_system_id: "grade-system-ng-basic-secondary".to_owned(),
            calendar_kind: crate::academic_workspace::domain::AcademicCalendarKind::Terms,
            period_names: vec![
                "First term".to_owned(),
                "Second term".to_owned(),
                "Third term".to_owned(),
            ],
            active_period_ordinal: 1,
            assignments: vec![CreateTeachingAssignment {
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: Some("A".to_owned()),
            }],
        },
    )
    .expect("academic workspace")
    .workspace
    .expect("configured workspace");
    let first_period_id = workspace.active_period_id.clone();
    let second_period_id = workspace
        .periods
        .iter()
        .find(|period| period.ordinal == 2)
        .expect("second academic period")
        .id
        .clone();
    let scheme_context = SchemeContextRequest {
        academic_session_id: workspace.active_session_id.clone(),
        academic_period_id: first_period_id.clone(),
        teaching_assignment_id: workspace.active_assignment_id.clone(),
    };
    let scheme = create_scheme(
        &database,
        CreateSchemeOfWorkRequest {
            context: scheme_context.clone(),
            framework_name: "School Curriculum".to_owned(),
            authority: "Curriculum Office".to_owned(),
            jurisdiction: "Nigeria".to_owned(),
            version: "2026".to_owned(),
            source_uri: None,
            term_starts_on: "2026-09-07".to_owned(),
            term_ends_on: "2026-09-20".to_owned(),
            mid_term_break_starts_on: None,
            mid_term_break_ends_on: None,
        },
    )
    .expect("scheme")
    .scheme
    .expect("saved scheme");
    let teaching_week_id = scheme.weeks[0].id.clone();
    let break_week_id = scheme.weeks[1].id.clone();
    save_week(
        &database,
        SaveSchemeWeekRequest {
            context: scheme_context.clone(),
            week_id: break_week_id.clone(),
            kind: SchemeWeekKind::Break,
            title: Some("Mid-term break".to_owned()),
        },
    )
    .expect("break week");
    let scheme = save_entry(
        &database,
        SaveSchemeEntryRequest {
            context: scheme_context,
            entry_id: None,
            week_id: teaching_week_id.clone(),
            topic: "Linear equations".to_owned(),
            subtopic: Some("Inverse operations".to_owned()),
            curriculum_unit: "Algebra".to_owned(),
            curriculum_outcomes: vec![
                "Solve one-step linear equations.".to_owned(),
                "Explain inverse operations.".to_owned(),
            ],
            objectives: vec!["Solve equations accurately.".to_owned()],
            assessment: vec!["Complete an exit problem.".to_owned()],
            instructional_materials: vec!["Balance-scale diagram".to_owned()],
            notes: None,
        },
    )
    .expect("scheme entry")
    .scheme
    .expect("scheme");

    TestContext {
        database,
        lesson_context: LessonContextRequest {
            academic_session_id: workspace.active_session_id,
            academic_period_id: first_period_id,
            teaching_assignment_id: workspace.active_assignment_id,
        },
        scheme_entry_id: scheme.weeks[0].entries[0].id.clone(),
        teaching_week_id,
        break_week_id,
        second_period_id,
    }
}

pub(super) fn structured_request(context: &TestContext) -> SaveLessonDraftRequest {
    SaveLessonDraftRequest {
        context: context.lesson_context.clone(),
        lesson_id: None,
        scheme_week_id: Some(context.teaching_week_id.clone()),
        scheme_entry_id: Some(context.scheme_entry_id.clone()),
        input_mode: LessonInputMode::Structured,
        topic: "Linear equations".to_owned(),
        subtopic: Some("Inverse operations".to_owned()),
        raw_plan: None,
        learning_goals: vec!["Solve one-step equations.".to_owned()],
        steps: vec![LessonStepInput {
            title: "Model inverse operations".to_owned(),
            teacher_activity: "Model one equation using a balance.".to_owned(),
            learner_activity: "Explain each inverse operation.".to_owned(),
            duration_minutes: Some(20),
        }],
        instructional_materials: vec!["Balance-scale diagram".to_owned()],
        previous_knowledge: vec!["Learners can add and subtract whole numbers.".to_owned()],
        assessment: vec!["Solve an exit problem.".to_owned()],
        assignment: vec!["Exercise 4b, questions 1 to 5.".to_owned()],
        references: vec!["School mathematics text, chapter 4".to_owned()],
    }
}

pub(super) fn teacher_authored_lesson(context: &TestContext) -> String {
    save_draft(
        &context.database,
        SaveLessonDraftRequest {
            context: context.lesson_context.clone(),
            lesson_id: None,
            scheme_week_id: None,
            scheme_entry_id: None,
            input_mode: LessonInputMode::Structured,
            topic: "Equivalent fractions".to_owned(),
            subtopic: None,
            raw_plan: None,
            learning_goals: vec!["Compare two fractions using visual models.".to_owned()],
            steps: vec![],
            instructional_materials: vec![],
            previous_knowledge: vec![],
            assessment: vec![],
            assignment: vec![],
            references: vec![],
        },
    )
    .expect("a teacher-authored draft")
    .selected_lesson
    .expect("a saved draft")
    .id
}
