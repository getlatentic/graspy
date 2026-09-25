use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::db::Database;
use crate::scheme_of_work::domain::{
    normalize_key, CreateSchemeFromTemplateRequest, SchemeContextSnapshot, ValidatedSchemeEntry,
    ValidatedSchemeSetup, ValidatedTermDates,
};
use crate::scheme_of_work::package::SchemePackageEntry;

use super::reads::load_snapshot;
use super::template_packages::resolve_stable_curriculum_entry;
use super::{
    ensure_dates_within_session, ensure_no_scheme, ensure_term_calendar, from_json,
    insert_derived_weeks, new_id, resolve_context, resolve_course, resolve_framework,
    resolve_outcomes, resolve_unit, to_json, RepositoryError, RepositoryResult, ResolvedContext,
};

pub(in crate::scheme_of_work) fn create_scheme_from_template(
    database: &Database,
    request: CreateSchemeFromTemplateRequest,
) -> Result<SchemeContextSnapshot, String> {
    let dates = ValidatedTermDates::new(
        &request.term_starts_on,
        &request.term_ends_on,
        request.mid_term_break_starts_on.as_deref(),
        request.mid_term_break_ends_on.as_deref(),
    )?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        ensure_dates_within_session(dates, &context)?;
        ensure_no_scheme(&transaction, &context)?;

        let template = resolve_template_for_context(&transaction, &request.template_id, &context)?;
        let template_week_count = transaction.query_row(
            "SELECT COUNT(*) FROM scheme_template_weeks WHERE template_id = ?1",
            params![request.template_id],
            |row| row.get::<_, i64>(0),
        )?;
        let derived_week_count = dates.ends_on.signed_duration_since(dates.starts_on).num_days() / 7 + 1;
        if derived_week_count < template_week_count {
            return Err(RepositoryError::Validation(format!(
                "These term dates provide {derived_week_count} weeks, but the selected scheme needs {template_week_count}. Extend the term end date."
            )));
        }

        let course_id = match &context.curriculum_course_id {
            Some(course_id) => course_id.clone(),
            None => {
                let setup = ValidatedSchemeSetup {
                    framework_name: format!("{} scheme of work", template.publisher),
                    normalized_framework_name: normalize_key(&format!(
                        "{} scheme of work",
                        template.publisher
                    )),
                    authority: template.publisher.clone(),
                    normalized_authority: normalize_key(&template.publisher),
                    jurisdiction: template.jurisdiction,
                    version: template.edition,
                    source_uri: template.source_uri,
                    starts_on: dates.starts_on,
                    ends_on: dates.ends_on,
                };
                let framework_id = resolve_framework(&transaction, &setup)?;
                resolve_course(&transaction, &context, &framework_id)?
            }
        };
        ensure_term_calendar(&transaction, &context.period_id, dates)?;
        let scheme_id = new_id("scheme");
        transaction.execute(
            "INSERT INTO schemes_of_work (
                 id, academic_session_id, academic_period_id,
                 teaching_assignment_id, subject_id, grade_level_id,
                 curriculum_course_id, scheme_template_id, title
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                scheme_id,
                context.session_id,
                context.period_id,
                context.assignment_id,
                context.subject_id,
                context.grade_level_id,
                course_id,
                request.template_id,
                template.title,
            ],
        )?;
        let week_ids = insert_derived_weeks(&transaction, &scheme_id, dates)?;
        copy_template_into_scheme(
            &transaction,
            &request.template_id,
            &scheme_id,
            &course_id,
            &week_ids,
        )?;
        transaction.commit()?;
        load_snapshot(connection, &context)
    })
}

#[derive(Debug)]
struct ResolvedTemplate {
    title: String,
    publisher: String,
    jurisdiction: String,
    edition: String,
    source_uri: Option<String>,
}

fn resolve_template_for_context(
    connection: &Connection,
    template_id: &str,
    context: &ResolvedContext,
) -> RepositoryResult<ResolvedTemplate> {
    connection
        .query_row(
            "SELECT
                 scheme_templates.title,
                 scheme_template_packages.publisher,
                 scheme_template_packages.jurisdiction,
                 scheme_template_packages.edition,
                 scheme_template_packages.source_uri
             FROM scheme_templates
             JOIN scheme_template_packages
               ON scheme_template_packages.id = scheme_templates.package_id
             WHERE scheme_templates.id = ?1
               AND scheme_templates.subject_id = ?2
               AND scheme_templates.grade_level_id = ?3
               AND scheme_templates.period_ordinal = ?4
               AND scheme_templates.period_kind = ?5
               AND scheme_templates.status = 'active'",
            params![
                template_id,
                context.subject_id,
                context.grade_level_id,
                context.period_ordinal,
                context.period_kind.as_str()
            ],
            |row| {
                Ok(ResolvedTemplate {
                    title: row.get(0)?,
                    publisher: row.get(1)?,
                    jurisdiction: row.get(2)?,
                    edition: row.get(3)?,
                    source_uri: row.get(4)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound(
                "The selected scheme is not available for this subject, class and academic period."
                    .to_owned(),
            )
        })
}

fn copy_template_into_scheme(
    transaction: &Transaction<'_>,
    template_id: &str,
    scheme_id: &str,
    course_id: &str,
    scheme_week_ids: &[String],
) -> RepositoryResult<()> {
    let template_weeks = {
        let mut statement = transaction.prepare(
            "SELECT id, ordinal, kind, title
             FROM scheme_template_weeks
             WHERE template_id = ?1 ORDER BY ordinal",
        )?;
        let rows = statement
            .query_map(params![template_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    for (template_week_id, ordinal, kind, title) in template_weeks {
        let scheme_week_id = scheme_week_ids.get((ordinal - 1) as usize).ok_or_else(|| {
            RepositoryError::Validation("The term calendar is too short.".to_owned())
        })?;
        transaction.execute(
            "UPDATE scheme_weeks SET kind = ?1, title = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3 AND scheme_id = ?4",
            params![kind, title, scheme_week_id, scheme_id],
        )?;
        if kind != "teaching" {
            continue;
        }
        let entries = load_template_entries(transaction, &template_week_id)?;
        for entry in entries {
            insert_template_entry(transaction, scheme_week_id, scheme_id, course_id, entry)?;
        }
    }
    Ok(())
}

fn load_template_entries(
    connection: &Connection,
    template_week_id: &str,
) -> RepositoryResult<Vec<SchemePackageEntry>> {
    let mut statement = connection.prepare(
        "SELECT sequence, topic, subtopic, curriculum_unit,
                learning_outcomes, objectives, assessment, instructional_materials, notes,
                curriculum_node_code, objective_codes, source_record_ids
         FROM scheme_template_entries
         WHERE template_week_id = ?1 ORDER BY sequence",
    )?;
    let rows = statement.query_map(params![template_week_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, Option<String>>(10)?,
            row.get::<_, Option<String>>(11)?,
        ))
    })?;
    rows.map(|row| {
        let (
            sequence,
            topic,
            subtopic,
            curriculum_unit,
            learning_outcomes,
            objectives,
            assessment,
            instructional_materials,
            notes,
            curriculum_node_code,
            objective_codes,
            source_record_ids,
        ) = row?;
        Ok(SchemePackageEntry {
            sequence,
            topic,
            subtopic,
            curriculum_unit,
            curriculum_node_code,
            objective_codes: objective_codes
                .as_deref()
                .map(from_json)
                .transpose()?
                .unwrap_or_default(),
            source_record_ids: source_record_ids
                .as_deref()
                .map(from_json)
                .transpose()?
                .unwrap_or_default(),
            learning_outcomes: from_json(&learning_outcomes)?,
            objectives: from_json(&objectives)?,
            assessment: from_json(&assessment)?,
            instructional_materials: from_json(&instructional_materials)?,
            notes,
        })
    })
    .collect()
}

fn insert_template_entry(
    transaction: &Transaction<'_>,
    scheme_week_id: &str,
    scheme_id: &str,
    course_id: &str,
    entry: SchemePackageEntry,
) -> RepositoryResult<()> {
    if entry.curriculum_node_code.is_some() {
        return insert_stable_template_entry(
            transaction,
            scheme_week_id,
            scheme_id,
            course_id,
            entry,
        );
    }
    let input = ValidatedSchemeEntry {
        normalized_curriculum_unit: normalize_key(&entry.curriculum_unit),
        topic: entry.topic,
        subtopic: entry.subtopic,
        curriculum_unit: entry.curriculum_unit,
        curriculum_outcomes: entry.learning_outcomes,
        objectives: entry.objectives,
        assessment: entry.assessment,
        instructional_materials: entry.instructional_materials,
        notes: entry.notes,
    };
    let unit_id = resolve_unit(transaction, course_id, &input)?;
    let outcome_ids = resolve_outcomes(transaction, course_id, &unit_id, &input)?;
    let entry_id = new_id("scheme-entry");
    transaction.execute(
        "INSERT INTO scheme_entries (
             id, scheme_week_id, scheme_id, curriculum_course_id,
             curriculum_unit_id, sequence, topic, subtopic,
             objectives, assessment, instructional_materials, notes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            entry_id,
            scheme_week_id,
            scheme_id,
            course_id,
            unit_id,
            entry.sequence,
            input.topic,
            input.subtopic,
            to_json(&input.objectives)?,
            to_json(&input.assessment)?,
            to_json(&input.instructional_materials)?,
            input.notes,
        ],
    )?;
    for outcome_id in outcome_ids {
        transaction.execute(
            "INSERT INTO scheme_entry_outcomes (
                 scheme_entry_id, curriculum_outcome_id, curriculum_course_id
             ) VALUES (?1, ?2, ?3)",
            params![entry_id, outcome_id, course_id],
        )?;
    }
    Ok(())
}

fn insert_stable_template_entry(
    transaction: &Transaction<'_>,
    scheme_week_id: &str,
    scheme_id: &str,
    course_id: &str,
    entry: SchemePackageEntry,
) -> RepositoryResult<()> {
    let (node_id, objective_ids) = resolve_stable_curriculum_entry(transaction, course_id, &entry)?;
    let entry_id = new_id("scheme-entry");
    transaction.execute(
        "INSERT INTO scheme_entries (
             id, scheme_week_id, scheme_id, curriculum_course_id,
             curriculum_node_id, sequence, topic, subtopic,
             objectives, assessment, instructional_materials, notes
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            entry_id,
            scheme_week_id,
            scheme_id,
            course_id,
            node_id,
            entry.sequence,
            entry.topic,
            entry.subtopic,
            to_json(&entry.objectives)?,
            to_json(&entry.assessment)?,
            to_json(&entry.instructional_materials)?,
            entry.notes,
        ],
    )?;
    for objective_id in objective_ids {
        transaction.execute(
            "INSERT INTO scheme_entry_atomic_objectives (
                 scheme_entry_id, atomic_objective_id, curriculum_course_id
             ) VALUES (?1, ?2, ?3)",
            params![entry_id, objective_id, course_id],
        )?;
    }
    for (index, record_id) in entry.source_record_ids.iter().enumerate() {
        transaction.execute(
            "INSERT INTO scheme_entry_source_records (
                 scheme_entry_id, record_id, sequence
             ) VALUES (?1, ?2, ?3)",
            params![entry_id, record_id, (index + 1) as i64],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {

    use crate::scheme_of_work::repository::*;

    use crate::scheme_of_work::repository::test_support::*;

    #[test]
    fn installs_a_compatible_template_and_copies_it_into_a_local_scheme() {
        let (database, context) = setup_database();
        let installed = install_template_package(
            &database,
            InstallSchemeTemplatePackageRequest {
                context: context.clone(),
                package_contents: template_package("Mathematics", "Whole numbers"),
            },
        )
        .expect("template installation");
        let template = &installed.available_templates[0];

        assert_eq!(template.trust, SchemeTemplateTrust::School);
        assert_eq!(template.origin, SchemeTemplateOrigin::Imported);
        assert_eq!(template.week_count, 2);
        assert_eq!(template.plan_count, 1);

        let created = create_scheme_from_template(
            &database,
            CreateSchemeFromTemplateRequest {
                context,
                template_id: template.id.clone(),
                term_starts_on: "2026-09-07".to_owned(),
                term_ends_on: "2026-09-27".to_owned(),
                mid_term_break_starts_on: None,
                mid_term_break_ends_on: None,
            },
        )
        .expect("scheme from template")
        .scheme
        .expect("created scheme");

        assert_eq!(
            created.origin_template_id.as_deref(),
            Some(template.id.as_str())
        );
        assert_eq!(created.weeks.len(), 3);
        assert_eq!(created.weeks[0].entries[0].topic, "Whole numbers");
        assert_eq!(created.weeks[1].kind, SchemeWeekKind::Break);
        assert!(created.weeks[2].entries.is_empty());
    }

    #[test]
    fn installs_and_copies_version_three_stable_curriculum_links() {
        let (database, context) = setup_granular_database();
        let installed = install_template_package(
            &database,
            InstallSchemeTemplatePackageRequest {
                context: context.clone(),
                package_contents: granular_template_package("school.ng-maths-jss1"),
            },
        )
        .expect("version 3 template");
        let template_id = installed.available_templates[0].id.clone();

        let created = create_scheme_from_template(
            &database,
            CreateSchemeFromTemplateRequest {
                context: context.clone(),
                template_id,
                term_starts_on: "2026-09-07".to_owned(),
                term_ends_on: "2026-09-20".to_owned(),
                mid_term_break_starts_on: None,
                mid_term_break_ends_on: None,
            },
        )
        .expect("scheme from granular template")
        .scheme
        .expect("created scheme");

        assert_eq!(
            created.weeks[0].entries[0].curriculum_unit.title,
            "Ordering whole numbers"
        );
        assert_eq!(
            created.weeks[0].entries[0].curriculum_outcomes[0].statement,
            "Arrange whole numbers."
        );
        assert_eq!(created.weeks[1].kind, SchemeWeekKind::Test);
        let stable_entry = &created.weeks[0].entries[0];
        let edited = save_entry(
            &database,
            SaveSchemeEntryRequest {
                context,
                entry_id: Some(stable_entry.id.clone()),
                week_id: created.weeks[0].id.clone(),
                topic: stable_entry.topic.clone(),
                subtopic: stable_entry.subtopic.clone(),
                curriculum_unit: stable_entry.curriculum_unit.title.clone(),
                curriculum_outcomes: stable_entry
                    .curriculum_outcomes
                    .iter()
                    .map(|outcome| outcome.statement.clone())
                    .collect(),
                objectives: vec!["Order four whole numbers.".to_owned()],
                assessment: stable_entry.assessment.clone(),
                instructional_materials: stable_entry.instructional_materials.clone(),
                notes: Some("Teacher-adjusted practice scope.".to_owned()),
            },
        )
        .expect("edited stable weekly plan")
        .scheme
        .expect("edited scheme");
        assert_eq!(
            edited.weeks[0].entries[0].objectives,
            ["Order four whole numbers."]
        );
        let counts = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_entries WHERE curriculum_node_id IS NOT NULL",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_entry_atomic_objectives",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_entry_source_records",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row("SELECT COUNT(*) FROM curriculum_units", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                ))
            })
            .expect("stable scheme links");
        assert_eq!(counts, (1, 1, 1, 0));
    }

    #[test]
    fn rejects_term_dates_that_cannot_hold_the_template_weeks() {
        let (database, context) = setup_database();
        let installed = install_template_package(
            &database,
            InstallSchemeTemplatePackageRequest {
                context: context.clone(),
                package_contents: template_package("Mathematics", "Whole numbers"),
            },
        )
        .expect("template installation");

        let error = create_scheme_from_template(
            &database,
            CreateSchemeFromTemplateRequest {
                context,
                template_id: installed.available_templates[0].id.clone(),
                term_starts_on: "2026-09-07".to_owned(),
                term_ends_on: "2026-09-07".to_owned(),
                mid_term_break_starts_on: None,
                mid_term_break_ends_on: None,
            },
        )
        .expect_err("calendar shorter than template");

        assert!(error.contains("scheme needs 2"));
    }
}
