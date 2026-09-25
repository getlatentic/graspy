use rusqlite::{params, Connection, OptionalExtension};

use crate::db::Database;
use crate::scheme_of_work::domain::{
    CurriculumCourse, CurriculumFramework, CurriculumOutcome, CurriculumUnit, SchemeContextRequest,
    SchemeContextSnapshot, SchemeEntry, SchemeOfWork, SchemeTemplateOrigin, SchemeTemplateSummary,
    SchemeTemplateTrust, SchemeTemplateWeekPreview, SchemeWeek, SchemeWeekKind, TermCalendar,
};

use super::{from_json, resolve_context, RepositoryError, RepositoryResult, ResolvedContext};

pub(in crate::scheme_of_work) fn get_context(
    database: &Database,
    request: SchemeContextRequest,
) -> Result<SchemeContextSnapshot, String> {
    database.with_connection(move |connection| {
        let context = resolve_context(connection, &request)?;
        load_snapshot(connection, &context)
    })
}

pub(super) fn load_snapshot(
    connection: &Connection,
    context: &ResolvedContext,
) -> RepositoryResult<SchemeContextSnapshot> {
    let scheme = connection
        .query_row(
            "SELECT
                 schemes_of_work.id,
                 schemes_of_work.title,
                 schemes_of_work.scheme_template_id,
                 curriculum_courses.id,
                 curriculum_courses.title,
                 curriculum_frameworks.id,
                 curriculum_frameworks.name,
                 curriculum_frameworks.authority,
                 curriculum_frameworks.jurisdiction,
                 curriculum_frameworks.version,
                 curriculum_frameworks.source_uri,
                 term_calendars.starts_on,
                 term_calendars.ends_on
             FROM schemes_of_work
             JOIN curriculum_courses
               ON curriculum_courses.id = schemes_of_work.curriculum_course_id
             JOIN curriculum_frameworks
               ON curriculum_frameworks.id = curriculum_courses.framework_id
             JOIN term_calendars
               ON term_calendars.academic_period_id = schemes_of_work.academic_period_id
             WHERE schemes_of_work.academic_period_id = ?1
               AND schemes_of_work.teaching_assignment_id = ?2
               AND schemes_of_work.status = 'active'",
            params![context.period_id, context.assignment_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    CurriculumFramework {
                        id: row.get(5)?,
                        name: row.get(6)?,
                        authority: row.get(7)?,
                        jurisdiction: row.get(8)?,
                        version: row.get(9)?,
                        source_uri: row.get(10)?,
                    },
                    TermCalendar {
                        starts_on: row.get(11)?,
                        ends_on: row.get(12)?,
                    },
                ))
            },
        )
        .optional()?;

    let scheme = scheme
        .map(
            |(
                scheme_id,
                title,
                origin_template_id,
                course_id,
                course_title,
                framework,
                calendar,
            )| {
                Ok::<SchemeOfWork, RepositoryError>(SchemeOfWork {
                    weeks: query_weeks(connection, &scheme_id, &course_id)?,
                    id: scheme_id,
                    title,
                    origin_template_id,
                    academic_session_id: context.session_id.clone(),
                    academic_period_id: context.period_id.clone(),
                    academic_period_name: context.period_name.clone(),
                    teaching_assignment_id: context.assignment_id.clone(),
                    curriculum: CurriculumCourse {
                        id: course_id,
                        title: course_title,
                        subject: context.subject.clone(),
                        grade_level: context.grade_level.clone(),
                        framework,
                    },
                    calendar,
                })
            },
        )
        .transpose()?;
    Ok(SchemeContextSnapshot {
        scheme,
        available_templates: query_available_templates(connection, context)?,
    })
}

fn query_available_templates(
    connection: &Connection,
    context: &ResolvedContext,
) -> RepositoryResult<Vec<SchemeTemplateSummary>> {
    let mut statement = connection.prepare(
        "SELECT
             scheme_templates.id,
             scheme_templates.title,
             scheme_template_packages.publisher,
             scheme_template_packages.jurisdiction,
             scheme_template_packages.edition,
             scheme_template_packages.trust,
             scheme_template_packages.origin,
             COUNT(DISTINCT scheme_template_weeks.id),
             COUNT(scheme_template_entries.id)
         FROM scheme_templates
         JOIN scheme_template_packages
           ON scheme_template_packages.id = scheme_templates.package_id
         JOIN scheme_template_weeks
           ON scheme_template_weeks.template_id = scheme_templates.id
         LEFT JOIN scheme_template_entries
           ON scheme_template_entries.template_week_id = scheme_template_weeks.id
         WHERE scheme_templates.subject_id = ?1
           AND scheme_templates.grade_level_id = ?2
           AND scheme_templates.period_ordinal = ?3
           AND scheme_templates.period_kind = ?4
           AND scheme_templates.status = 'active'
         GROUP BY scheme_templates.id
         ORDER BY
             CASE scheme_template_packages.trust WHEN 'verified' THEN 0 ELSE 1 END,
             CASE scheme_template_packages.origin WHEN 'bundled' THEN 0 ELSE 1 END,
             scheme_template_packages.publisher,
             scheme_templates.title",
    )?;
    let rows = statement.query_map(
        params![
            context.subject_id,
            context.grade_level_id,
            context.period_ordinal,
            context.period_kind.as_str()
        ],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
            ))
        },
    )?;
    let mut templates = Vec::new();
    for row in rows {
        let (id, title, publisher, jurisdiction, edition, trust, origin, week_count, plan_count) =
            row?;
        templates.push(SchemeTemplateSummary {
            weeks: query_template_week_previews(connection, &id)?,
            id,
            title,
            publisher,
            jurisdiction,
            edition,
            trust: if trust == "verified" {
                SchemeTemplateTrust::Verified
            } else {
                SchemeTemplateTrust::School
            },
            origin: if origin == "bundled" {
                SchemeTemplateOrigin::Bundled
            } else {
                SchemeTemplateOrigin::Imported
            },
            week_count,
            plan_count,
        });
    }
    Ok(templates)
}

fn query_template_week_previews(
    connection: &Connection,
    template_id: &str,
) -> RepositoryResult<Vec<SchemeTemplateWeekPreview>> {
    let mut statement = connection.prepare(
        "SELECT id, ordinal, kind, title
         FROM scheme_template_weeks WHERE template_id = ?1 ORDER BY ordinal",
    )?;
    let rows = statement.query_map(params![template_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    let mut weeks = Vec::new();
    for row in rows {
        let (week_id, ordinal, kind, title) = row?;
        let mut topic_statement = connection.prepare(
            "SELECT topic FROM scheme_template_entries
             WHERE template_week_id = ?1 ORDER BY sequence",
        )?;
        let topics = topic_statement
            .query_map(params![week_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        weeks.push(SchemeTemplateWeekPreview {
            ordinal,
            kind: parse_week_kind(&kind),
            title,
            topics,
        });
    }
    Ok(weeks)
}

fn query_weeks(
    connection: &Connection,
    scheme_id: &str,
    course_id: &str,
) -> RepositoryResult<Vec<SchemeWeek>> {
    let mut statement = connection.prepare(
        "SELECT id, ordinal, starts_on, ends_on, kind, title
         FROM scheme_weeks WHERE scheme_id = ?1 ORDER BY ordinal",
    )?;
    let rows = statement.query_map(params![scheme_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
        ))
    })?;
    let mut weeks = Vec::new();
    for row in rows {
        let (id, ordinal, starts_on, ends_on, kind, title) = row?;
        weeks.push(SchemeWeek {
            entries: query_entries(connection, &id, course_id)?,
            id,
            ordinal,
            starts_on,
            ends_on,
            kind: parse_week_kind(&kind),
            title,
        });
    }
    Ok(weeks)
}

fn query_entries(
    connection: &Connection,
    week_id: &str,
    course_id: &str,
) -> RepositoryResult<Vec<SchemeEntry>> {
    let mut statement = connection.prepare(
        "SELECT
             scheme_entries.id,
             scheme_entries.sequence,
             scheme_entries.topic,
             scheme_entries.subtopic,
             COALESCE(curriculum_units.id, curriculum_nodes.id),
             COALESCE(curriculum_units.title, curriculum_nodes.title),
             scheme_entries.objectives,
             scheme_entries.assessment,
             scheme_entries.instructional_materials,
             scheme_entries.notes,
             lessons.id
         FROM scheme_entries
         LEFT JOIN curriculum_units ON curriculum_units.id = scheme_entries.curriculum_unit_id
         LEFT JOIN curriculum_nodes ON curriculum_nodes.id = scheme_entries.curriculum_node_id
         -- Every status counts: the one-lesson-per-plan rule is enforced on the
         -- column, so a draft claims the plan exactly as a confirmed one does.
         LEFT JOIN lessons ON lessons.scheme_entry_id = scheme_entries.id
         WHERE scheme_entries.scheme_week_id = ?1 AND scheme_entries.status = 'active'
         ORDER BY scheme_entries.sequence",
    )?;
    let rows = statement.query_map(params![week_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            CurriculumUnit {
                id: row.get(4)?,
                title: row.get(5)?,
            },
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, Option<String>>(10)?,
        ))
    })?;
    let mut entries = Vec::new();
    for row in rows {
        let (
            id,
            sequence,
            topic,
            subtopic,
            unit,
            objectives,
            assessment,
            instructional_materials,
            notes,
            planned_lesson_id,
        ) = row?;
        entries.push(SchemeEntry {
            curriculum_outcomes: query_outcomes(connection, &id, course_id)?,
            id,
            sequence,
            topic,
            subtopic,
            curriculum_unit: unit,
            objectives: from_json(&objectives)?,
            assessment: from_json(&assessment)?,
            instructional_materials: from_json(&instructional_materials)?,
            notes,
            planned_lesson_id,
        });
    }
    Ok(entries)
}

fn query_outcomes(
    connection: &Connection,
    entry_id: &str,
    course_id: &str,
) -> RepositoryResult<Vec<CurriculumOutcome>> {
    let mut statement = connection.prepare(
        "SELECT curriculum_outcomes.id, curriculum_outcomes.statement
         FROM scheme_entry_outcomes
         JOIN curriculum_outcomes
           ON curriculum_outcomes.id = scheme_entry_outcomes.curriculum_outcome_id
         WHERE scheme_entry_outcomes.scheme_entry_id = ?1
           AND scheme_entry_outcomes.curriculum_course_id = ?2
         ORDER BY curriculum_outcomes.sequence",
    )?;
    let rows = statement.query_map(params![entry_id, course_id], |row| {
        Ok(CurriculumOutcome {
            id: row.get(0)?,
            statement: row.get(1)?,
        })
    })?;
    let outcomes = rows.collect::<Result<Vec<_>, _>>()?;
    if !outcomes.is_empty() {
        return Ok(outcomes);
    }
    let mut statement = connection.prepare(
        "SELECT curriculum_nodes.id, COALESCE(curriculum_nodes.statement, curriculum_nodes.title)
         FROM scheme_entries
         JOIN curriculum_nodes
           ON curriculum_nodes.parent_node_id = scheme_entries.curriculum_node_id
          AND curriculum_nodes.curriculum_course_id = scheme_entries.curriculum_course_id
          AND curriculum_nodes.kind = 'performance_objective'
         WHERE scheme_entries.id = ?1
           AND scheme_entries.curriculum_course_id = ?2
         ORDER BY curriculum_nodes.sequence",
    )?;
    let rows = statement.query_map(params![entry_id, course_id], |row| {
        Ok(CurriculumOutcome {
            id: row.get(0)?,
            statement: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn parse_week_kind(value: &str) -> SchemeWeekKind {
    match value {
        "revision" => SchemeWeekKind::Revision,
        "test" => SchemeWeekKind::Test,
        "break" => SchemeWeekKind::Break,
        "examination" => SchemeWeekKind::Examination,
        _ => SchemeWeekKind::Teaching,
    }
}

#[cfg(test)]
mod tests {

    use crate::scheme_of_work::repository::*;

    use crate::scheme_of_work::repository::test_support::*;

    #[test]
    fn creates_complete_non_overlapping_weeks_and_restores_them() {
        let (database, context) = setup_database();
        let created = create_scheme(&database, create_request(context.clone()))
            .expect("scheme creation")
            .scheme
            .expect("scheme");
        let restored = get_context(&database, context)
            .expect("scheme restoration")
            .scheme
            .expect("restored scheme");

        assert_eq!(created, restored);
        assert_eq!(created.weeks.len(), 3);
        assert_eq!(created.weeks[0].starts_on, "2026-09-07");
        assert_eq!(created.weeks[0].ends_on, "2026-09-13");
        assert_eq!(created.weeks[2].ends_on, "2026-09-23");
    }

    /// A weekly plan says whether it already has a lesson, so the term plan can
    /// offer the way into it rather than offering to start a second one the
    /// library would refuse.
    #[test]
    fn a_weekly_plan_names_the_lesson_already_written_from_it() {
        let (database, context) = setup_database();
        let scheme = create_scheme(&database, create_request(context.clone()))
            .expect("scheme creation")
            .scheme
            .expect("scheme");
        let entry = save_entry(&database, entry_request(&scheme, context.clone()))
            .expect("weekly plan saved")
            .scheme
            .expect("scheme")
            .weeks
            .iter()
            .flat_map(|week| week.entries.clone())
            .next()
            .expect("the weekly plan just saved");
        assert_eq!(
            entry.planned_lesson_id, None,
            "a plan nobody has written a lesson from names none"
        );

        attach_lesson(&database, &context, &entry.id, "lesson-from-this-plan");

        let planned = get_context(&database, context)
            .expect("scheme reopened")
            .scheme
            .expect("scheme")
            .weeks
            .iter()
            .flat_map(|week| week.entries.clone())
            .next()
            .expect("the weekly plan");
        assert_eq!(
            planned.planned_lesson_id.as_deref(),
            Some("lesson-from-this-plan")
        );
    }
}
