use std::fmt::Write;

use super::domain::{LessonPlanExportInput, LessonPlanExportStep, LessonPlanIdentity};
use super::html::{document_shell, escape, render_markdown};

/// The lesson plan as the paper a school reads.
///
/// The order of what follows is the order a lesson plan is read in, and it is
/// fixed: week and class first, then what learners should be able to do, what
/// the teacher brings, what the class already knows, how the lesson runs, how it
/// is checked, what is set to take home, and a line to sign.
pub(super) fn render_plan(input: &LessonPlanExportInput) -> Result<String, String> {
    let mut body = String::with_capacity(8_000);
    write!(
        body,
        "<header class=\"running-header\"><b>graspy</b><span>{}</span><span>Lesson plan</span></header><main><header class=\"document-heading\"><p class=\"eyebrow\">{}</p><h1>{}</h1>",
        escape(&input.eyebrow),
        escape(&input.eyebrow),
        escape(&input.title),
    )
    .map_err(fmt_error)?;
    if !input.subtitle.trim().is_empty() {
        write!(
            body,
            "<p class=\"subtopic\">{}</p>",
            escape(&input.subtitle)
        )
        .map_err(fmt_error)?;
    }
    body.push_str("</header>");

    render_identity(&mut body, &input.identity)?;
    render_objectives(&mut body, &input.objectives)?;
    render_plan_list(
        &mut body,
        "Instructional materials",
        &input.instructional_materials,
    )?;
    render_plan_list(&mut body, "Previous knowledge", &input.previous_knowledge)?;
    render_presentation(&mut body, &input.steps)?;
    render_plan_list(&mut body, "Evaluation", &input.evaluation)?;
    render_plan_list(&mut body, "Assignment", &input.assignment)?;
    if !input.references.is_empty() {
        render_plan_list(&mut body, "Sources", &input.references)?;
    }
    body.push_str(SIGNATURE_BLOCK);

    body.push_str("</main>");
    write!(
        body,
        "<footer class=\"running-footer\"><span>{}</span><span class=\"page-number\"></span></footer>",
        escape(&input.title),
    )
    .map_err(fmt_error)?;

    Ok(document_shell(
        &format!("{} - Lesson plan", input.title),
        "graspy-export lesson-plan",
        PLAN_CSS,
        &body,
    ))
}

/// Which lesson this is. Every entry is printed, so a period graspy does not
/// know is a rule a teacher writes on rather than a heading their school will
/// find missing.
fn render_identity(body: &mut String, identity: &LessonPlanIdentity) -> Result<(), String> {
    body.push_str("<dl class=\"plan-identity\">");
    let entries: [(&str, Option<&str>); 5] = [
        ("Week", identity.week.as_deref()),
        ("Class", Some(identity.class_name.as_str())),
        ("Subject", Some(identity.subject.as_str())),
        ("Period", identity.period.as_deref()),
        ("Duration", identity.duration.as_deref()),
    ];
    for (label, value) in entries {
        write!(
            body,
            "<div><dt>{label}</dt><dd>{}</dd></div>",
            value.map(escape).unwrap_or_default(),
        )
        .map_err(fmt_error)?;
    }
    body.push_str("</dl>");
    Ok(())
}

fn render_objectives(body: &mut String, objectives: &[String]) -> Result<(), String> {
    body.push_str(
        "<section class=\"plan-section\"><h2>Objectives</h2><p class=\"plan-lead\">At the end of the lesson, pupils should be able to:</p>",
    );
    if objectives.is_empty() {
        body.push_str(WRITING_RULES);
    } else {
        body.push_str("<ol class=\"plan-list\">");
        for objective in objectives {
            write!(body, "<li>{}</li>", escape(objective)).map_err(fmt_error)?;
        }
        body.push_str("</ol>");
    }
    body.push_str("</section>");
    Ok(())
}

fn render_presentation(body: &mut String, steps: &[LessonPlanExportStep]) -> Result<(), String> {
    body.push_str("<section class=\"plan-section\"><h2>Presentation</h2>");
    if steps.is_empty() {
        body.push_str(WRITING_RULES);
    }
    for (index, step) in steps.iter().enumerate() {
        write!(
            body,
            "<article class=\"classwork-block plan-step\"><h3>Step {}: {}",
            index + 1,
            escape(&step.title),
        )
        .map_err(fmt_error)?;
        if let Some(minutes) = step.duration_minutes {
            write!(body, "<span class=\"plan-duration\">{minutes} min</span>")
                .map_err(fmt_error)?;
        }
        body.push_str("</h3>");
        write!(
            body,
            "<div class=\"plan-activity\"><p class=\"plan-role\">Teacher:</p><div class=\"classwork-text\">{}</div></div><div class=\"plan-activity\"><p class=\"plan-role\">Learners:</p><div class=\"classwork-text\">{}</div></div></article>",
            render_markdown(&step.teacher_activity),
            render_markdown(&step.learner_activity),
        )
        .map_err(fmt_error)?;
    }
    body.push_str("</section>");
    Ok(())
}

fn render_plan_list(body: &mut String, heading: &str, items: &[String]) -> Result<(), String> {
    write!(body, "<section class=\"plan-section\"><h2>{heading}</h2>").map_err(fmt_error)?;
    if items.is_empty() {
        body.push_str(WRITING_RULES);
    } else {
        body.push_str("<ul class=\"plan-list\">");
        for item in items {
            write!(body, "<li>{}</li>", escape(item)).map_err(fmt_error)?;
        }
        body.push_str("</ul>");
    }
    body.push_str("</section>");
    Ok(())
}

fn fmt_error(error: std::fmt::Error) -> String {
    error.to_string()
}

/// Two ruled lines where a section has nothing to print, so the heading a school
/// checks for is on the page with room to answer it.
const WRITING_RULES: &str = "<div class=\"plan-rules\"><span></span><span></span></div>";

const SIGNATURE_BLOCK: &str =
    "<section class=\"plan-signature\"><div><span class=\"plan-rule-label\">Signature</span><span class=\"plan-rule\"></span></div><div><span class=\"plan-rule-label\">Date</span><span class=\"plan-rule\"></span></div></section>";

const PLAN_CSS: &str = r#"
.plan-identity { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; margin: 5mm 0 0; border: .6pt solid #b8c8d8; }
.plan-identity > div { padding: 2mm 2.5mm; border-right: .6pt solid #b8c8d8; }
.plan-identity > div:last-child { border-right: 0; }
.plan-identity dt { margin: 0 0 1mm; color: #45566a; font-size: 7.5pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.plan-identity dd { margin: 0; font-size: 10pt; min-height: 5mm; }
.plan-section { margin-top: 8mm; }
.plan-section > h2 { margin: 0 0 3mm; font-size: 13pt; }
.plan-lead { margin: 0 0 2mm; color: #263746; }
.plan-list { margin: 0; padding-left: 6mm; }
.plan-list li + li { margin-top: 1mm; }
.plan-rules { display: grid; gap: 6mm; padding-top: 3mm; }
.plan-rules span { display: block; border-bottom: .5pt solid #b8c8d8; }
.plan-step .plan-duration { margin-left: 3mm; color: #586a7c; font-size: 8.5pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.plan-activity { margin-top: 2.5mm; }
.plan-role { margin: 0 0 1mm; color: #006fa6; font-size: 8pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.plan-signature { display: grid; grid-template-columns: 2fr 1fr; gap: 8mm; margin-top: 12mm; break-inside: avoid; }
.plan-signature > div { display: grid; gap: 1mm; }
.plan-rule-label { color: #45566a; font-size: 8pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.plan-rule { display: block; height: 8mm; border-bottom: .6pt solid #45566a; }
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn plan_sample() -> LessonPlanExportInput {
        LessonPlanExportInput {
            title: "Adding fractions".to_owned(),
            subtitle: "A 40-minute lesson".to_owned(),
            eyebrow: "Mathematics · JSS 2".to_owned(),
            identity: LessonPlanIdentity {
                week: Some("3".to_owned()),
                class_name: "JSS 2".to_owned(),
                subject: "Mathematics".to_owned(),
                period: None,
                duration: Some("40 minutes".to_owned()),
            },
            objectives: vec![
                "Add fractions with the same denominator.".to_owned(),
                "Simplify sums & compare results.".to_owned(),
            ],
            instructional_materials: vec!["Fraction wall <laminated>".to_owned()],
            previous_knowledge: vec!["Learners can name equal parts of one whole.".to_owned()],
            steps: vec![
                LessonPlanExportStep {
                    title: "Recall equivalent fractions".to_owned(),
                    teacher_activity: "Model $\\frac{1}{2}=\\frac{2}{4}$ on the board.".to_owned(),
                    learner_activity: "Copy two examples and label them.".to_owned(),
                    duration_minutes: Some(20),
                },
                LessonPlanExportStep {
                    title: "Practise adding".to_owned(),
                    teacher_activity: "Circulate and check working.".to_owned(),
                    learner_activity: "Complete the practice set.".to_owned(),
                    duration_minutes: None,
                },
            ],
            evaluation: vec!["Exit ticket: two addition questions.".to_owned()],
            assignment: vec!["Exercise 7c, questions 1 to 6.".to_owned()],
            references: vec!["Siyavula Mathematics, Grade 8.".to_owned()],
        }
    }

    /// The order is the whole point: a school reads a lesson plan top to bottom,
    /// and a plan that answers the same questions in another order is one a
    /// teacher copies into their notebook by hand.
    #[test]
    fn plan_export_prints_the_headings_of_a_lesson_plan_in_order() {
        let html = render_plan(&plan_sample()).expect("plan export");

        let mut read_to = 0;
        for heading in [
            "<h2>Objectives</h2>",
            "<h2>Instructional materials</h2>",
            "<h2>Previous knowledge</h2>",
            "<h2>Presentation</h2>",
            "<h2>Evaluation</h2>",
            "<h2>Assignment</h2>",
        ] {
            let found = html[read_to..]
                .find(heading)
                .unwrap_or_else(|| panic!("{heading} is missing or comes out of order"));
            read_to += found + heading.len();
        }
    }

    #[test]
    fn plan_export_states_the_lesson_and_phrases_its_objectives_for_the_paper() {
        let html = render_plan(&plan_sample()).expect("plan export");

        assert!(html.contains("At the end of the lesson, pupils should be able to:"));
        assert!(html.contains("<dt>Week</dt><dd>3</dd>"));
        assert!(html.contains("<dt>Class</dt><dd>JSS 2</dd>"));
        assert!(html.contains("<dt>Subject</dt><dd>Mathematics</dd>"));
        assert!(html.contains("<dt>Duration</dt><dd>40 minutes</dd>"));
        assert!(html.contains("Learners can name equal parts of one whole."));
        assert!(html.contains("Exercise 7c, questions 1 to 6."));
        assert!(html.contains(">Signature<"));
        assert!(html.contains(">Date<"));
        assert!(html.contains("Simplify sums &amp; compare results."));
        assert!(!html.contains("Simplify sums & compare results."));
        assert!(html.contains("Fraction wall &lt;laminated&gt;"));
        assert!(html.contains("graspy-export-ready"));
    }

    /// graspy does not know a school's timetable, so the period is a rule to
    /// write on rather than a heading the plan is missing.
    #[test]
    fn plan_export_leaves_room_to_write_what_graspy_does_not_hold() {
        let mut input = plan_sample();
        input.instructional_materials = Vec::new();
        input.previous_knowledge = Vec::new();

        let html = render_plan(&input).expect("plan export");

        assert!(html.contains("<dt>Period</dt><dd></dd>"));
        assert!(html.contains("<h2>Instructional materials</h2><div class=\"plan-rules\">"));
        assert!(html.contains("<h2>Previous knowledge</h2><div class=\"plan-rules\">"));
        assert!(html.contains("<h2>Evaluation</h2><ul"));
    }
}
