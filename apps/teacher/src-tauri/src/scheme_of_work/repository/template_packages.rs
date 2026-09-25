use std::fs;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use tauri::{AppHandle, Manager};

use crate::db::Database;
use crate::scheme_of_work::domain::{
    normalize_key, InstallSchemeTemplatePackageRequest, SchemeContextSnapshot,
};
use crate::scheme_of_work::package::{
    validate_package, PackageTrust, SchemePackageEntry, SchemePackagePayload,
    ValidatedSchemePackage,
};

use super::reads::load_snapshot;
use super::{new_id, resolve_context, to_json, RepositoryError, RepositoryResult, ResolvedContext};

pub(super) const BUNDLED_LAGOS_JSS1_MATHEMATICS_PATHS: [&str; 3] = [
    "resources/content/lagos-jss1-mathematics-scheme/term-1.graspy-scheme",
    "resources/content/lagos-jss1-mathematics-scheme/term-2.graspy-scheme",
    "resources/content/lagos-jss1-mathematics-scheme/term-3.graspy-scheme",
];

#[derive(Debug, Clone, Copy)]
enum InstallOrigin {
    Bundled,
    Imported,
}

impl InstallOrigin {
    fn as_str(self) -> &'static str {
        match self {
            Self::Bundled => "bundled",
            Self::Imported => "imported",
        }
    }
}

struct TemplateBinding {
    subject_id: String,
    grade_level_id: String,
    curriculum_course_id: Option<String>,
}

pub(in crate::scheme_of_work) fn install_template_package(
    database: &Database,
    request: InstallSchemeTemplatePackageRequest,
) -> Result<SchemeContextSnapshot, String> {
    let package = validate_package(&request.package_contents)?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        ensure_package_matches_context(&transaction, &package.payload, &context)?;
        install_validated_template_package(
            &transaction,
            &package,
            InstallOrigin::Imported,
            TemplateBinding {
                subject_id: context.subject_id.clone(),
                grade_level_id: context.grade_level_id.clone(),
                curriculum_course_id: context.curriculum_course_id.clone(),
            },
        )?;
        transaction.commit()?;
        load_snapshot(connection, &context)
    })
}

pub(crate) fn install_bundled_packages(database: &Database, app: &AppHandle) -> Result<(), String> {
    let resource_directory = Manager::path(app)
        .resource_dir()
        .map_err(|_| "The included schemes of work could not be located.".to_owned())?;
    let package_contents = BUNDLED_LAGOS_JSS1_MATHEMATICS_PATHS
        .iter()
        .map(|path| {
            fs::read_to_string(resource_directory.join(path))
                .map_err(|_| "An included scheme of work could not be opened.".to_owned())
        })
        .collect::<Result<Vec<_>, _>>()?;
    install_bundled_package_contents(database, &package_contents)
}

pub(super) fn install_bundled_package_contents(
    database: &Database,
    package_contents: &[String],
) -> Result<(), String> {
    let packages = package_contents
        .iter()
        .map(|contents| validate_package(contents))
        .collect::<Result<Vec<_>, _>>()?;
    database.with_connection_mut(move |connection| -> RepositoryResult<()> {
        let transaction = connection.transaction()?;
        for package in &packages {
            let binding = resolve_package_catalog_binding(&transaction, &package.payload)?;
            install_validated_template_package(
                &transaction,
                package,
                InstallOrigin::Bundled,
                binding,
            )?;
        }
        transaction.commit()?;
        Ok(())
    })
}

fn install_validated_template_package(
    transaction: &Transaction<'_>,
    package: &ValidatedSchemePackage,
    origin: InstallOrigin,
    binding: TemplateBinding,
) -> RepositoryResult<()> {
    if let Some(installed_digest) = transaction
        .query_row(
            "SELECT payload_sha256 FROM scheme_template_packages
             WHERE package_key = ?1 AND edition = ?2",
            params![package.payload.package_id, package.payload.edition],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        if installed_digest == package.payload_sha256 {
            return Ok(());
        }
        return Err(RepositoryError::Conflict(
            "A different file with the same package and edition is already installed. Ask the publisher for a new edition."
                .to_owned(),
        ));
    }

    let package_id = new_id("scheme-package");
    transaction.execute(
        "INSERT INTO scheme_template_packages (
             id, package_key, title, publisher, normalized_publisher,
             jurisdiction, edition, source_uri, payload_sha256,
             trust, signer_key_id, payload, source_sha256, dataset_sha256,
             licence_id, licence_name, licence_url, attribution,
             modification_notice, curriculum_package_key, curriculum_course_key,
             rights_kind, rights_name, rights_statement, rights_url, origin
         ) VALUES (
             ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
             ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21,
             ?22, ?23, ?24, ?25, ?26
         )",
        params![
            package_id,
            package.payload.package_id,
            package.payload.title,
            package.payload.publisher,
            normalize_key(&package.payload.publisher),
            package.payload.jurisdiction,
            package.payload.edition,
            package.payload.source_url,
            package.payload_sha256,
            package_trust_name(package.trust),
            package.signer_key_id,
            package.payload_json,
            package.payload.source_sha256,
            package.payload.dataset_sha256,
            package.payload.licence.as_ref().map(|licence| &licence.id),
            package
                .payload
                .licence
                .as_ref()
                .map(|licence| &licence.name),
            package.payload.licence.as_ref().map(|licence| &licence.url),
            package.payload.attribution,
            package.payload.modification_notice,
            package.payload.curriculum_package_id,
            package.payload.curriculum_course_key,
            package
                .payload
                .rights_basis
                .as_ref()
                .map(|basis| basis.kind.as_str()),
            package
                .payload
                .rights_basis
                .as_ref()
                .map(|basis| &basis.name),
            package
                .payload
                .rights_basis
                .as_ref()
                .map(|basis| &basis.statement),
            package
                .payload
                .rights_basis
                .as_ref()
                .map(|basis| &basis.url),
            origin.as_str(),
        ],
    )?;
    let template_id = new_id("scheme-template");
    let period = package.payload.academic_period();
    transaction.execute(
        "INSERT INTO scheme_templates (
             id, package_id, subject_id, grade_level_id,
             period_ordinal, period_kind, period_name, title
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            template_id,
            package_id,
            binding.subject_id,
            binding.grade_level_id,
            period.ordinal,
            period.kind.as_str(),
            period.name,
            package.payload.title,
        ],
    )?;
    for week in &package.payload.weeks {
        let template_week_id = new_id("scheme-template-week");
        transaction.execute(
            "INSERT INTO scheme_template_weeks (
                 id, template_id, ordinal, kind, title
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                template_week_id,
                template_id,
                week.ordinal,
                week.kind.as_str(),
                week.title,
            ],
        )?;
        for entry in &week.entries {
            if entry.curriculum_node_code.is_some() {
                let course_id = binding.curriculum_course_id.as_deref().ok_or_else(|| {
                    RepositoryError::Validation(
                        "Choose the curriculum used by this scheme before importing it.".to_owned(),
                    )
                })?;
                resolve_stable_curriculum_entry(transaction, course_id, entry)?;
            }
            let objective_codes = (!entry.objective_codes.is_empty())
                .then(|| to_json(&entry.objective_codes))
                .transpose()?;
            let source_record_ids = (!entry.source_record_ids.is_empty())
                .then(|| to_json(&entry.source_record_ids))
                .transpose()?;
            transaction.execute(
                "INSERT INTO scheme_template_entries (
                     id, template_week_id, template_id, sequence, topic, subtopic,
                     curriculum_unit, learning_outcomes, objectives, assessment,
                     instructional_materials, notes, curriculum_node_code, objective_codes,
                     source_record_ids
                 ) VALUES (
                     ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                     ?12, ?13, ?14, ?15
                 )",
                params![
                    new_id("scheme-template-entry"),
                    template_week_id,
                    template_id,
                    entry.sequence,
                    entry.topic,
                    entry.subtopic,
                    entry.curriculum_unit,
                    to_json(&entry.learning_outcomes)?,
                    to_json(&entry.objectives)?,
                    to_json(&entry.assessment)?,
                    to_json(&entry.instructional_materials)?,
                    entry.notes,
                    entry.curriculum_node_code,
                    objective_codes,
                    source_record_ids,
                ],
            )?;
        }
    }
    Ok(())
}

fn ensure_package_matches_context(
    connection: &Connection,
    payload: &SchemePackagePayload,
    context: &ResolvedContext,
) -> RepositoryResult<()> {
    if normalize_key(&payload.subject) != normalize_key(&context.subject) {
        return Err(RepositoryError::Validation(
            "This scheme file is for a different subject than the selected subject.".to_owned(),
        ));
    }
    if payload.grade_level_code != context.grade_level_code {
        return Err(RepositoryError::Validation(
            "This scheme file is for a different class than the selected class.".to_owned(),
        ));
    }
    let package_period = payload.academic_period();
    if package_period.ordinal != context.period_ordinal
        || package_period.kind != context.period_kind
    {
        return Err(RepositoryError::Validation(
            "This scheme file is for a different academic period than the selected period."
                .to_owned(),
        ));
    }
    if let (Some(package_key), Some(course_key)) = (
        payload.curriculum_package_id.as_deref(),
        payload.curriculum_course_key.as_deref(),
    ) {
        let course_id = context.curriculum_course_id.as_deref().ok_or_else(|| {
            RepositoryError::Validation(
                "Choose the curriculum used by this scheme before importing it.".to_owned(),
            )
        })?;
        let matches = connection.query_row(
            "SELECT EXISTS(
                 SELECT 1
                 FROM curriculum_courses
                 JOIN curriculum_frameworks
                   ON curriculum_frameworks.id = curriculum_courses.framework_id
                 JOIN curriculum_packages
                   ON curriculum_packages.id = curriculum_frameworks.package_id
                 WHERE curriculum_courses.id = ?1
                   AND curriculum_courses.course_key = ?2
                   AND curriculum_packages.package_key = ?3
             )",
            params![course_id, course_key, package_key],
            |row| row.get::<_, bool>(0),
        )?;
        if !matches {
            return Err(RepositoryError::Validation(
                "This scheme was prepared for a different curriculum edition.".to_owned(),
            ));
        }
    }
    Ok(())
}

fn resolve_package_catalog_binding(
    connection: &Connection,
    payload: &SchemePackagePayload,
) -> RepositoryResult<TemplateBinding> {
    let package_key = payload.curriculum_package_id.as_deref().ok_or_else(|| {
        RepositoryError::Validation(
            "An included scheme must identify its curriculum package.".to_owned(),
        )
    })?;
    let course_key = payload.curriculum_course_key.as_deref().ok_or_else(|| {
        RepositoryError::Validation(
            "An included scheme must identify its curriculum course.".to_owned(),
        )
    })?;
    let binding = connection
        .query_row(
            "SELECT
                 curriculum_courses.id,
                 curriculum_courses.subject_id,
                 curriculum_courses.grade_level_id,
                 subjects.name,
                 grade_levels.code
             FROM curriculum_courses
             JOIN curriculum_frameworks
               ON curriculum_frameworks.id = curriculum_courses.framework_id
             JOIN curriculum_packages
               ON curriculum_packages.id = curriculum_frameworks.package_id
             JOIN subjects ON subjects.id = curriculum_courses.subject_id
             JOIN grade_levels ON grade_levels.id = curriculum_courses.grade_level_id
             WHERE curriculum_packages.package_key = ?1
               AND curriculum_courses.course_key = ?2
               AND curriculum_frameworks.status = 'active'
               AND curriculum_courses.status = 'active'",
            params![package_key, course_key],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Validation(
                "The curriculum required by an included scheme is not installed.".to_owned(),
            )
        })?;
    if normalize_key(&payload.subject) != normalize_key(&binding.3) {
        return Err(RepositoryError::Validation(
            "An included scheme does not match its curriculum subject.".to_owned(),
        ));
    }
    if payload.grade_level_code != binding.4 {
        return Err(RepositoryError::Validation(
            "An included scheme does not match its curriculum class.".to_owned(),
        ));
    }
    Ok(TemplateBinding {
        curriculum_course_id: Some(binding.0),
        subject_id: binding.1,
        grade_level_id: binding.2,
    })
}

fn package_trust_name(trust: PackageTrust) -> &'static str {
    match trust {
        PackageTrust::Verified => "verified",
        PackageTrust::School => "school",
    }
}

pub(super) fn resolve_stable_curriculum_entry(
    connection: &Connection,
    course_id: &str,
    entry: &SchemePackageEntry,
) -> RepositoryResult<(String, Vec<String>)> {
    let node_code = entry
        .curriculum_node_code
        .as_deref()
        .expect("stable entry checked by caller");
    let node_id = connection
        .query_row(
            "SELECT id FROM curriculum_nodes
             WHERE curriculum_course_id = ?1 AND source_code = ?2 AND kind = 'subtopic'",
            params![course_id, node_code],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Validation(format!(
                "The scheme refers to a curriculum entry that is not in the selected curriculum: {node_code}."
            ))
        })?;
    let learning_outcomes = {
        let mut statement = connection.prepare(
            "SELECT COALESCE(statement, title)
             FROM curriculum_nodes
             WHERE curriculum_course_id = ?1
               AND parent_node_id = ?2
               AND kind = 'performance_objective'
             ORDER BY sequence",
        )?;
        let outcomes = statement
            .query_map(params![course_id, node_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        outcomes
    };
    if learning_outcomes != entry.learning_outcomes {
        return Err(RepositoryError::Validation(
            "The scheme learning goals do not match the selected curriculum edition.".to_owned(),
        ));
    }

    let mut objective_ids = Vec::new();
    let mut objective_statements = Vec::new();
    for objective_code in &entry.objective_codes {
        let objective = connection
            .query_row(
                "WITH RECURSIVE descendants(id) AS (
                     SELECT ?2
                     UNION ALL
                     SELECT curriculum_nodes.id
                     FROM curriculum_nodes
                     JOIN descendants ON curriculum_nodes.parent_node_id = descendants.id
                     WHERE curriculum_nodes.curriculum_course_id = ?1
                 )
                 SELECT atomic_learning_objectives.id, atomic_learning_objectives.statement
                 FROM atomic_learning_objectives
                 WHERE atomic_learning_objectives.curriculum_course_id = ?1
                   AND atomic_learning_objectives.source_code = ?3
                   AND atomic_learning_objectives.curriculum_node_id IN descendants",
                params![course_id, node_id, objective_code],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::Validation(format!(
                    "The scheme refers to a learning goal that is not under {node_code}: {objective_code}."
                ))
            })?;
        objective_ids.push(objective.0);
        objective_statements.push(objective.1);
    }
    if objective_statements != entry.objectives {
        return Err(RepositoryError::Validation(
            "The scheme objectives do not match the selected curriculum edition.".to_owned(),
        ));
    }
    Ok((node_id, objective_ids))
}

#[cfg(test)]
mod tests {

    use crate::scheme_of_work::repository::*;

    use crate::curriculum_catalog::{
        domain::InstallCurriculumPackageRequest,
        repository::install_package as install_curriculum_package,
    };
    use crate::scheme_of_work::repository::test_support::*;

    #[test]
    fn installs_all_included_lagos_terms_with_exact_pacing_counts() {
        let database = Database::in_memory();
        let resource_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let curriculum_contents = std::fs::read_to_string(resource_root.join(
            "resources/content/nerdc-jss1-mathematics-september-2025/curriculum.graspy-curriculum",
        ))
        .expect("included curriculum");
        install_curriculum_package(
            &database,
            InstallCurriculumPackageRequest {
                package_contents: curriculum_contents,
            },
        )
        .expect("curriculum installed before pacing");
        let package_contents = BUNDLED_LAGOS_JSS1_MATHEMATICS_PATHS
            .iter()
            .map(|path| std::fs::read_to_string(resource_root.join(path)).expect("included pacing"))
            .collect::<Vec<_>>();

        install_bundled_package_contents(&database, &package_contents)
            .expect("included pacing installed");
        install_bundled_package_contents(&database, &package_contents)
            .expect("included pacing reinstall is idempotent");

        let counts = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_packages
                         WHERE origin = 'bundled' AND trust = 'school'
                           AND rights_kind = 'official_text' AND licence_id IS NULL",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row("SELECT COUNT(*) FROM scheme_templates", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_weeks",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_entries",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_weeks WHERE kind = 'teaching'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_weeks WHERE kind = 'revision'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_weeks WHERE kind = 'test'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_weeks WHERE kind = 'examination'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM scheme_template_weeks WHERE kind = 'break'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("included pacing counts");
        assert_eq!(counts, (3, 3, 39, 74, 27, 4, 3, 4, 1));
    }

    #[test]
    fn rejects_version_three_pacing_for_a_different_curriculum() {
        let (database, context) = setup_granular_database();
        let error = install_template_package(
            &database,
            InstallSchemeTemplatePackageRequest {
                context,
                package_contents: granular_template_package("another.curriculum"),
            },
        )
        .expect_err("wrong curriculum edition");

        assert!(error.contains("different curriculum edition"));
    }

    #[test]
    fn rejects_a_template_for_another_subject() {
        let (database, context) = setup_database();
        let incompatible = template_package("English Language", "Whole numbers");
        let error = install_template_package(
            &database,
            InstallSchemeTemplatePackageRequest {
                context,
                package_contents: incompatible,
            },
        )
        .expect_err("incompatible template");

        assert!(error.contains("selected subject"));
    }

    #[test]
    fn rejects_a_changed_file_for_the_same_package_and_edition() {
        let (database, context) = setup_database();
        install_template_package(
            &database,
            InstallSchemeTemplatePackageRequest {
                context: context.clone(),
                package_contents: template_package("Mathematics", "Whole numbers"),
            },
        )
        .expect("first installation");
        let changed = template_package("Mathematics", "Fractions");
        let error = install_template_package(
            &database,
            InstallSchemeTemplatePackageRequest {
                context,
                package_contents: changed,
            },
        )
        .expect_err("changed package");

        assert!(error.contains("same package and edition"));
    }

    #[test]
    fn reinstalling_the_same_package_is_idempotent() {
        let (database, context) = setup_database();
        let request = InstallSchemeTemplatePackageRequest {
            context: context.clone(),
            package_contents: template_package("Mathematics", "Whole numbers"),
        };

        install_template_package(&database, request.clone()).expect("first installation");
        let restored = install_template_package(&database, request).expect("same installation");

        assert_eq!(restored.available_templates.len(), 1);
    }
}
