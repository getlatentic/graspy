use std::{collections::HashMap, fmt, fs};

use rusqlite::{params, Connection, ErrorCode, OptionalExtension, Transaction};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::db::Database;

use super::{
    domain::{
        AssignCurriculumCourseRequest, CurriculumCatalogSnapshot, CurriculumCourseOption,
        CurriculumPackageOrigin, CurriculumPackageSummary, CurriculumPackageTrust,
        InstallCurriculumPackageRequest,
    },
    package::{
        validate_package, CurriculumPackageCourse, PackageTrust, ValidatedCurriculumPackage,
    },
};

type RepositoryResult<T> = Result<T, RepositoryError>;

const BUNDLED_NERDC_JSS1_MATHEMATICS_PATH: &str =
    "resources/content/nerdc-jss1-mathematics-september-2025/curriculum.graspy-curriculum";

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

#[derive(Debug)]
enum RepositoryError {
    Database(rusqlite::Error),
    Validation(String),
    Conflict(String),
    NotFound(String),
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => {
                let _diagnostic_source = error;
                formatter.write_str(
                    "The curriculum library could not be updated. Close the app, reopen it, and try again.",
                )
            }
            Self::Validation(message) | Self::Conflict(message) | Self::NotFound(message) => {
                formatter.write_str(message)
            }
        }
    }
}

impl From<rusqlite::Error> for RepositoryError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

impl From<String> for RepositoryError {
    fn from(message: String) -> Self {
        Self::Validation(message)
    }
}

pub(crate) fn get_catalog(database: &Database) -> Result<CurriculumCatalogSnapshot, String> {
    database.with_connection(load_catalog)
}

pub(crate) fn install_package(
    database: &Database,
    request: InstallCurriculumPackageRequest,
) -> Result<CurriculumCatalogSnapshot, String> {
    let package = validate_package(&request.package_contents)?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        install_validated_package(&transaction, &package, InstallOrigin::Imported)?;
        transaction.commit()?;
        load_catalog(connection)
    })
}

pub(crate) fn install_bundled_packages(database: &Database, app: &AppHandle) -> Result<(), String> {
    let resource_directory = Manager::path(app)
        .resource_dir()
        .map_err(|_| "The included curriculum could not be located.".to_owned())?;
    let package_contents =
        fs::read_to_string(resource_directory.join(BUNDLED_NERDC_JSS1_MATHEMATICS_PATH))
            .map_err(|_| "The included curriculum could not be opened.".to_owned())?;
    install_bundled_package_contents(database, &package_contents)
}

pub(crate) fn install_bundled_package_contents(
    database: &Database,
    package_contents: &str,
) -> Result<(), String> {
    let package = validate_package(package_contents)?;
    database.with_connection_mut(move |connection| -> RepositoryResult<()> {
        let transaction = connection.transaction()?;
        install_validated_package(&transaction, &package, InstallOrigin::Bundled)?;
        transaction.commit()?;
        Ok(())
    })
}

pub(crate) fn assign_course(
    database: &Database,
    request: AssignCurriculumCourseRequest,
) -> Result<(), String> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let assignment = transaction
            .query_row(
                "SELECT subject_id, grade_level_id
                 FROM teaching_assignments
                 WHERE id = ?1 AND status = 'active'",
                params![request.assignment_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::NotFound(
                    "That subject and class is no longer available.".to_owned(),
                )
            })?;
        let course = transaction
            .query_row(
                "SELECT
                     curriculum_courses.subject_id,
                     curriculum_courses.grade_level_id,
                     curriculum_frameworks.jurisdiction_id
                 FROM curriculum_courses
                 JOIN curriculum_frameworks
                   ON curriculum_frameworks.id = curriculum_courses.framework_id
                 WHERE curriculum_courses.id = ?1
                   AND curriculum_courses.status = 'active'
                   AND curriculum_frameworks.status = 'active'
                   AND curriculum_frameworks.package_id IS NOT NULL",
                params![request.curriculum_course_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::NotFound("That curriculum is no longer available.".to_owned())
            })?;
        if assignment.0 != course.0 || assignment.1 != course.1 {
            return Err(RepositoryError::Validation(
                "Choose a curriculum for the same subject and class level.".to_owned(),
            ));
        }
        let school_jurisdiction = transaction.query_row(
            "SELECT jurisdiction_id FROM school_profiles WHERE singleton_id = 1",
            [],
            |row| row.get::<_, String>(0),
        )?;
        if !jurisdiction_is_compatible(&transaction, &school_jurisdiction, &course.2)? {
            return Err(RepositoryError::Validation(
                "Choose a curriculum approved for this school's location.".to_owned(),
            ));
        }
        transaction.execute(
            "UPDATE teaching_assignments
             SET curriculum_course_id = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2",
            params![request.curriculum_course_id, request.assignment_id],
        )?;
        transaction.commit()?;
        Ok(())
    })
}

fn install_validated_package(
    transaction: &Transaction<'_>,
    package: &ValidatedCurriculumPackage,
    origin: InstallOrigin,
) -> RepositoryResult<()> {
    if let Some(existing_digest) = transaction
        .query_row(
            "SELECT payload_sha256 FROM curriculum_packages
             WHERE package_key = ?1 AND edition = ?2 AND package_revision = ?3",
            params![
                package.payload.package_id,
                package.payload.edition,
                package.payload.package_revision
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        if existing_digest == package.payload_sha256 {
            return Ok(());
        }
        return Err(RepositoryError::Conflict(
            "A different curriculum file claims the same edition and revision. \
             Ask the publisher for a new edition."
                .to_owned(),
        ));
    }

    let jurisdiction_id = resolve_jurisdiction(transaction, package)?;
    let package_id = new_id("curriculum-package");
    let trust = match package.trust {
        PackageTrust::Verified => "verified",
        PackageTrust::School => "school",
    };
    transaction
        .execute(
            "INSERT INTO curriculum_packages (
             id, package_key, title, publisher, normalized_publisher,
             jurisdiction_id, edition, package_revision, effective_from, effective_to,
             source_uri, source_sha256, licence_id, licence_name, licence_url,
             attribution, modification_notice, payload_sha256, trust,
             signer_key_id, payload, dataset_sha256, rights_kind, rights_name,
             rights_statement, rights_url, origin
         ) VALUES (
             ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
             ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
             ?21, ?22, ?23, ?24, ?25, ?26, ?27
         )",
            params![
                package_id,
                package.payload.package_id,
                package.payload.title,
                package.payload.publisher,
                normalize_key(&package.payload.publisher),
                jurisdiction_id,
                package.payload.edition,
                package.payload.package_revision,
                package.payload.effective_from,
                package.payload.effective_to,
                package.payload.source_url,
                package.payload.source_sha256,
                package.payload.licence.as_ref().map(|licence| &licence.id),
                package
                    .payload
                    .licence
                    .as_ref()
                    .map(|licence| &licence.name),
                package.payload.licence.as_ref().map(|licence| &licence.url),
                package.payload.attribution(),
                package.payload.modification_notice,
                package.payload_sha256,
                trust,
                package.signer_key_id,
                package.payload_json,
                package.payload.dataset_sha256,
                package.payload.rights_basis().kind.as_str(),
                package.payload.rights_basis().name,
                package.payload.rights_basis().statement,
                package.payload.rights_basis().url,
                origin.as_str(),
            ],
        )
        .map_err(package_constraint)?;

    let framework_id = new_id("curriculum-framework");
    transaction
        .execute(
            "INSERT INTO curriculum_frameworks (
                 id, name, normalized_name, authority, normalized_authority,
                 jurisdiction, version, source_uri, jurisdiction_id,
                 effective_from, effective_to, source_sha256, licence_id,
                 licence_name, licence_url, attribution, trust, package_id,
                 modification_notice, rights_kind, rights_name,
                 rights_statement, rights_url
             ) VALUES (
                 ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                 ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
                 ?20, ?21, ?22, ?23
             )",
            params![
                framework_id,
                package.payload.framework.name,
                normalize_key(&package.payload.framework.name),
                package.payload.framework.authority,
                normalize_key(&package.payload.framework.authority),
                package.payload.jurisdiction_code,
                package.payload.edition,
                package.payload.source_url,
                jurisdiction_id,
                package.payload.effective_from,
                package.payload.effective_to,
                package.payload.source_sha256,
                package.payload.licence.as_ref().map(|licence| &licence.id),
                package
                    .payload
                    .licence
                    .as_ref()
                    .map(|licence| &licence.name),
                package.payload.licence.as_ref().map(|licence| &licence.url),
                package.payload.attribution(),
                trust,
                package_id,
                package.payload.modification_notice,
                package.payload.rights_basis().kind.as_str(),
                package.payload.rights_basis().name,
                package.payload.rights_basis().statement,
                package.payload.rights_basis().url,
            ],
        )
        .map_err(package_constraint)?;

    for course in &package.payload.courses {
        install_course(transaction, course, &framework_id, &jurisdiction_id)?;
    }
    Ok(())
}

fn resolve_jurisdiction(
    transaction: &Transaction<'_>,
    package: &ValidatedCurriculumPackage,
) -> RepositoryResult<String> {
    transaction
        .query_row(
            "SELECT id FROM jurisdictions WHERE country_code = ?1 AND code = ?2",
            params![
                package.payload.country_code,
                package.payload.jurisdiction_code
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Validation(
                "This curriculum is for a country or region that this Graspy release does not support."
                    .to_owned(),
            )
        })
}

fn install_course(
    transaction: &Transaction<'_>,
    course: &CurriculumPackageCourse,
    framework_id: &str,
    jurisdiction_id: &str,
) -> RepositoryResult<()> {
    let grade_system_id = transaction
        .query_row(
            "SELECT id FROM grade_systems
             WHERE jurisdiction_id = ?1 AND code = ?2 AND version = ?3 AND status = 'active'",
            params![
                jurisdiction_id,
                course.grade_system_code,
                course.grade_system_version
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Validation(format!(
                "{} uses a class-level system that is not available for this curriculum.",
                course.title
            ))
        })?;
    let grade_level_id = transaction
        .query_row(
            "SELECT id FROM grade_levels WHERE grade_system_id = ?1 AND code = ?2",
            params![grade_system_id, course.grade_level_code],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Validation(format!(
                "{} uses a class level that is not available in Graspy.",
                course.title
            ))
        })?;
    let subject_id = resolve_subject(transaction, &course.subject)?;
    let course_id = new_id("curriculum-course");
    transaction.execute(
        "INSERT INTO curriculum_courses (
             id, framework_id, subject_id, grade_level_id, title, course_key
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            course_id,
            framework_id,
            subject_id,
            grade_level_id,
            course.title,
            course.course_key,
        ],
    )?;

    let mut node_ids = HashMap::<String, String>::new();
    for node in &course.nodes {
        let id = new_id("curriculum-node");
        let parent_id = node.parent_code.as_ref().map(|code| {
            node_ids
                .get(code)
                .expect("validated parent ordering")
                .clone()
        });
        transaction.execute(
            "INSERT INTO curriculum_nodes (
                 id, curriculum_course_id, parent_node_id, kind, source_code,
                 title, statement, sequence, source_payload
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                course_id,
                parent_id,
                node.kind,
                node.code,
                node.title,
                node.statement,
                node.sequence,
                node.source_payload.to_string(),
            ],
        )?;
        node_ids.insert(node.code.clone(), id);
    }

    let mut objective_ids = HashMap::new();
    for objective in &course.objectives {
        let id = new_id("atomic-objective");
        transaction.execute(
            "INSERT INTO atomic_learning_objectives (
                 id, curriculum_course_id, curriculum_node_id, source_code,
                 statement, bloom_verb, bloom_level, sequence
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                course_id,
                node_ids.get(&objective.node_code).expect("validated node"),
                objective.code,
                objective.statement,
                objective.bloom_verb,
                objective.bloom_level,
                objective.sequence,
            ],
        )?;
        objective_ids.insert(objective.code.clone(), id);
    }

    let mut component_ids = HashMap::new();
    for component in &course.knowledge_components {
        let id = new_id("knowledge-component");
        transaction.execute(
            "INSERT INTO knowledge_components (
                 id, curriculum_course_id, curriculum_node_id, code,
                 description, bloom_level, knowledge_type
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                course_id,
                node_ids
                    .get(
                        component
                            .node_code
                            .as_ref()
                            .expect("validated node alignment")
                    )
                    .expect("validated node"),
                component.code,
                component.description,
                component.bloom_level,
                component.knowledge_type,
            ],
        )?;
        for objective_code in &component.objective_codes {
            transaction.execute(
                "INSERT INTO knowledge_component_objectives (
                     knowledge_component_id, atomic_objective_id, curriculum_course_id
                 ) VALUES (?1, ?2, ?3)",
                params![
                    id,
                    objective_ids
                        .get(objective_code)
                        .expect("validated objective alignment"),
                    course_id,
                ],
            )?;
        }
        component_ids.insert(component.code.clone(), id);
    }

    for prerequisite in &course.prerequisites {
        transaction.execute(
            "INSERT INTO knowledge_component_prerequisites (
                 knowledge_component_id, prerequisite_knowledge_component_id,
                 curriculum_course_id
             ) VALUES (?1, ?2, ?3)",
            params![
                component_ids
                    .get(&prerequisite.component_code)
                    .expect("validated component"),
                component_ids
                    .get(&prerequisite.prerequisite_code)
                    .expect("validated prerequisite"),
                course_id,
            ],
        )?;
    }
    for link in &course.source_links {
        let (node_id, objective_id) = match link.target_kind {
            super::package::CurriculumSourceTargetKind::Node => (
                Some(
                    node_ids
                        .get(&link.target_code)
                        .expect("validated source node"),
                ),
                None,
            ),
            super::package::CurriculumSourceTargetKind::Objective => (
                None,
                Some(
                    objective_ids
                        .get(&link.target_code)
                        .expect("validated source objective"),
                ),
            ),
        };
        transaction.execute(
            "INSERT INTO curriculum_source_links (
                 id, curriculum_course_id, curriculum_node_id, atomic_objective_id,
                 record_id, role, method, rationale, sequence
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                new_id("curriculum-source-link"),
                course_id,
                node_id,
                objective_id,
                link.record_id,
                link.role,
                link.method,
                link.rationale,
                link.sequence,
            ],
        )?;
    }
    Ok(())
}

fn resolve_subject(transaction: &Transaction<'_>, subject: &str) -> RepositoryResult<String> {
    let normalized = normalize_key(subject);
    if let Some(id) = transaction
        .query_row(
            "SELECT id FROM subjects WHERE normalized_name = ?1",
            params![normalized],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id = new_id("subject");
    transaction.execute(
        "INSERT INTO subjects (id, name, normalized_name) VALUES (?1, ?2, ?3)",
        params![id, subject, normalized],
    )?;
    Ok(id)
}

fn jurisdiction_is_compatible(
    transaction: &Transaction<'_>,
    school_jurisdiction_id: &str,
    curriculum_jurisdiction_id: &str,
) -> RepositoryResult<bool> {
    let mut cursor = Some(school_jurisdiction_id.to_owned());
    while let Some(jurisdiction_id) = cursor {
        if jurisdiction_id == curriculum_jurisdiction_id {
            return Ok(true);
        }
        cursor = transaction
            .query_row(
                "SELECT parent_jurisdiction_id FROM jurisdictions WHERE id = ?1",
                params![jurisdiction_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();
    }
    Ok(false)
}

fn load_catalog(connection: &Connection) -> RepositoryResult<CurriculumCatalogSnapshot> {
    Ok(CurriculumCatalogSnapshot {
        packages: query_packages(connection)?,
        courses: query_courses(connection)?,
    })
}

fn query_packages(connection: &Connection) -> RepositoryResult<Vec<CurriculumPackageSummary>> {
    let mut statement = connection.prepare(
        // One row per curriculum, not one per conversion of it. An improved
        // conversion installs beside the one teachers' lessons already cite,
        // which is deliberate — but listing both showed the same curriculum
        // twice, identically, with nothing to tell them apart. The newest is
        // the curriculum; the ones kept behind it are counted, not repeated.
        "SELECT
             curriculum_packages.id, curriculum_packages.title,
             curriculum_packages.publisher, jurisdictions.id,
             jurisdictions.name, curriculum_packages.edition,
             curriculum_packages.rights_name, curriculum_packages.attribution,
             curriculum_packages.trust, curriculum_packages.origin,
             curriculum_packages.installed_at,
             (SELECT COUNT(*) FROM curriculum_packages earlier
               WHERE earlier.package_key = curriculum_packages.package_key
                 AND earlier.edition = curriculum_packages.edition
                 AND earlier.package_revision < curriculum_packages.package_revision)
         FROM curriculum_packages
         JOIN jurisdictions ON jurisdictions.id = curriculum_packages.jurisdiction_id
         WHERE curriculum_packages.package_revision = (
             SELECT MAX(newest.package_revision) FROM curriculum_packages newest
              WHERE newest.package_key = curriculum_packages.package_key
                AND newest.edition = curriculum_packages.edition)
         ORDER BY curriculum_packages.publisher COLLATE NOCASE,
                  curriculum_packages.title COLLATE NOCASE,
                  curriculum_packages.edition COLLATE NOCASE",
    )?;
    let rows = statement.query_map([], |row| {
        let trust = CurriculumPackageTrust::from_str(&row.get::<_, String>(8)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?;
        let origin = CurriculumPackageOrigin::from_str(&row.get::<_, String>(9)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?;
        Ok(CurriculumPackageSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            publisher: row.get(2)?,
            jurisdiction_id: row.get(3)?,
            jurisdiction: row.get(4)?,
            edition: row.get(5)?,
            rights_name: row.get(6)?,
            attribution: row.get(7)?,
            trust,
            origin,
            installed_at: row.get(10)?,
            earlier_versions_kept: row.get(11)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_courses(connection: &Connection) -> RepositoryResult<Vec<CurriculumCourseOption>> {
    let mut statement = connection.prepare(
        "SELECT
             curriculum_courses.id, curriculum_packages.id,
             curriculum_frameworks.jurisdiction_id, curriculum_frameworks.name,
             subjects.id, subjects.name, grade_levels.id,
             grade_levels.display_name, curriculum_courses.title,
             curriculum_packages.publisher, curriculum_packages.edition,
             curriculum_packages.trust
         FROM curriculum_courses
         JOIN curriculum_frameworks
           ON curriculum_frameworks.id = curriculum_courses.framework_id
         JOIN curriculum_packages
           ON curriculum_packages.id = curriculum_frameworks.package_id
         JOIN subjects ON subjects.id = curriculum_courses.subject_id
         JOIN grade_levels ON grade_levels.id = curriculum_courses.grade_level_id
         WHERE curriculum_courses.status = 'active'
           AND curriculum_frameworks.status = 'active'
         ORDER BY subjects.name COLLATE NOCASE,
                  grade_levels.sort_order,
                  curriculum_packages.publisher COLLATE NOCASE",
    )?;
    let rows = statement.query_map([], |row| {
        let trust = CurriculumPackageTrust::from_str(&row.get::<_, String>(11)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?;
        Ok(CurriculumCourseOption {
            id: row.get(0)?,
            package_id: row.get(1)?,
            jurisdiction_id: row.get(2)?,
            framework: row.get(3)?,
            subject_id: row.get(4)?,
            subject: row.get(5)?,
            grade_level_id: row.get(6)?,
            grade_level: row.get(7)?,
            title: row.get(8)?,
            publisher: row.get(9)?,
            edition: row.get(10)?,
            trust,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn package_constraint(error: rusqlite::Error) -> RepositoryError {
    if matches!(
        error,
        rusqlite::Error::SqliteFailure(ref code, _)
            if code.code == ErrorCode::ConstraintViolation
    ) {
        RepositoryError::Conflict(
            "This curriculum conflicts with an installed framework or course.".to_owned(),
        )
    } else {
        RepositoryError::Database(error)
    }
}

fn normalize_key(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}

#[cfg(test)]
pub(crate) fn install_school_test_package(database: &Database) -> CurriculumCatalogSnapshot {
    use super::package::{test_school_package_contents, test_school_package_payload};

    install_package(
        database,
        InstallCurriculumPackageRequest {
            package_contents: test_school_package_contents(&test_school_package_payload()),
        },
    )
    .expect("installed curriculum")
}

#[cfg(test)]
mod tests {
    use crate::{
        academic_workspace::{
            domain::{
                AcademicCalendarKind, CreateAcademicWorkspaceRequest, CreateTeachingAssignment,
                SaveTeachingAssignmentRequest,
            },
            repository::{add_assignment, create_workspace},
        },
        db::Database,
    };

    use super::*;
    use crate::curriculum_catalog::package::{
        test_school_package_contents, test_school_package_payload,
        test_version_two_package_contents, test_version_two_package_payload,
    };

    #[test]
    fn installs_the_complete_hierarchy_in_one_transaction() {
        let database = Database::in_memory();
        let catalog = install_school_test_package(&database);

        assert_eq!(catalog.packages.len(), 1);
        assert_eq!(catalog.courses.len(), 1);
        assert_eq!(catalog.courses[0].subject, "Mathematics");
        assert_eq!(catalog.courses[0].grade_level, "JSS 1");
        let counts = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row("SELECT COUNT(*) FROM curriculum_nodes", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM atomic_learning_objectives",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_components",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_component_prerequisites",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("hierarchy counts");
        assert_eq!(counts, (2, 1, 2, 1));
    }

    #[test]
    fn a_new_conversion_of_the_same_edition_installs_beside_the_one_lessons_already_use() {
        let database = Database::in_memory();
        install_school_test_package(&database);

        let mut revised = test_school_package_payload();
        revised["packageRevision"] = serde_json::json!(2);
        revised["title"] = serde_json::json!("Mathematics JSS 1 curriculum, revised conversion");
        install_package(
            &database,
            InstallCurriculumPackageRequest {
                package_contents: test_school_package_contents(&revised),
            },
        )
        .expect("a later conversion installs beside the earlier one");

        let revisions = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT COUNT(*) FROM curriculum_packages
                     WHERE package_key = 'school.ng-maths-jss1' AND edition = '2026'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
            })
            .expect("installed revisions");
        assert_eq!(revisions, 2);

        // Both are installed, and the library shows one curriculum. Listing
        // both put the same name on screen twice with nothing to tell them
        // apart, which reads as a fault rather than as a kept version.
        let catalog = get_catalog(&database).expect("catalog");
        assert_eq!(catalog.packages.len(), 1);
        assert_eq!(
            catalog.packages[0].title, "Mathematics JSS 1 curriculum, revised conversion",
            "the curriculum shown is the newest conversion",
        );
        assert_eq!(
            catalog.packages[0].earlier_versions_kept, 1,
            "the conversion lessons already cite is accounted for, not hidden",
        );
    }

    /// Curriculum content as a release that stopped at schema 24 left it: written
    /// directly, because the current install path writes package_revision and that
    /// column does not exist yet.
    fn seed_curriculum_installed_before_revisions(database: &Database) {
        database
            .with_connection(|connection| {
                connection.execute_batch(
                    "INSERT INTO curriculum_packages (
                         id, package_key, title, publisher, normalized_publisher,
                         jurisdiction_id, edition, source_uri, source_sha256,
                         attribution, modification_notice, payload_sha256, trust,
                         payload, rights_kind, rights_name, rights_statement,
                         rights_url, origin
                     ) VALUES (
                         'pkg-1', 'school.ng-maths-jss1', 'Mathematics JSS 1',
                         'Example Curriculum Office', 'example curriculum office',
                         (SELECT id FROM jurisdictions LIMIT 1), '2026',
                         'https://example.edu/curriculum.pdf', '1111111111111111111111111111111111111111111111111111111111111111',
                         'Example Curriculum Office.', 'Converted without changing wording.',
                         '2222222222222222222222222222222222222222222222222222222222222222',
                         'school', '{}', 'official_text', 'Official administrative text',
                         'Recorded under the applicable law.', 'https://example.edu/law',
                         'bundled'
                     );

                     INSERT INTO curriculum_frameworks (
                         id, name, normalized_name, authority, normalized_authority,
                         jurisdiction, version, trust, package_id, jurisdiction_id
                     ) VALUES (
                         'fw-1', 'Example Basic Education Curriculum',
                         'example basic education curriculum', 'Example Curriculum Office',
                         'example curriculum office', 'NG', '2026', 'school', 'pkg-1',
                         (SELECT id FROM jurisdictions LIMIT 1)
                     );

                     INSERT INTO curriculum_courses (
                         id, framework_id, subject_id, grade_level_id, title
                     ) VALUES (
                         'course-1', 'fw-1',
                         (SELECT id FROM subjects LIMIT 1),
                         (SELECT id FROM grade_levels LIMIT 1),
                         'Mathematics · JSS 1'
                     );",
                )
            })
            .expect("curriculum installed by a previous release");
    }

    #[test]
    fn a_previous_release_library_upgrades_and_takes_the_next_conversion() {
        let database = Database::in_memory_through(24);
        seed_curriculum_installed_before_revisions(&database);

        database
            .upgrade_to_current_schema()
            .expect("a populated library upgrades in one step");

        let upgraded = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row(
                        "SELECT MAX(version) FROM schema_migrations",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT package_revision FROM curriculum_packages",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM curriculum_courses
                         JOIN curriculum_frameworks
                           ON curriculum_frameworks.id = curriculum_courses.framework_id
                         WHERE curriculum_frameworks.package_id = 'pkg-1'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM pragma_foreign_key_check",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("upgraded library");

        let (schema, revision, courses, dangling) = upgraded;
        assert_eq!(schema, crate::db::newest_known_schema_version());
        assert_eq!(
            revision, 1,
            "what a previous release installed is revision 1"
        );
        assert_eq!(
            courses, 1,
            "the course a lesson may cite still reaches its framework after the rebuild"
        );
        assert_eq!(dangling, 0, "the rebuild leaves no dangling reference");

        let mut revised = test_school_package_payload();
        revised["packageRevision"] = serde_json::json!(2);
        revised["title"] = serde_json::json!("A later conversion of the same edition");
        install_package(
            &database,
            InstallCurriculumPackageRequest {
                package_contents: test_school_package_contents(&revised),
            },
        )
        .expect("the next conversion installs after the upgrade");
    }

    #[test]
    fn a_changed_file_claiming_a_revision_that_is_taken_is_refused() {
        let database = Database::in_memory();
        install_school_test_package(&database);

        let mut altered = test_school_package_payload();
        altered["title"] = serde_json::json!("A different conversion under the same revision");

        let failure = install_package(
            &database,
            InstallCurriculumPackageRequest {
                package_contents: test_school_package_contents(&altered),
            },
        )
        .expect_err("a changed file under a taken revision must be refused");

        assert!(failure.contains("same edition and revision"), "{failure}");
    }

    #[test]
    fn installs_version_two_integrity_and_granular_source_links() {
        let database = Database::in_memory();
        let payload = test_version_two_package_payload();
        install_package(
            &database,
            InstallCurriculumPackageRequest {
                package_contents: test_version_two_package_contents(&payload),
            },
        )
        .expect("installed granular curriculum");

        let installed = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row(
                        "SELECT dataset_sha256 FROM curriculum_packages",
                        [],
                        |row| row.get::<_, String>(0),
                    )?,
                    connection.query_row(
                        "SELECT course_key FROM curriculum_courses",
                        [],
                        |row| row.get::<_, String>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_component_objectives",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM curriculum_source_links",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("granular package rows");

        assert_eq!(installed.0, "2".repeat(64));
        assert_eq!(installed.1, "mathematics-jss1");
        assert_eq!((installed.2, installed.3), (2, 1));
    }

    #[test]
    fn installs_the_bundled_revised_nerdc_package_with_its_exact_counts() {
        let database = Database::in_memory();
        let package_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(BUNDLED_NERDC_JSS1_MATHEMATICS_PATH);
        let package_contents = std::fs::read_to_string(package_path).expect("bundled package");

        install_bundled_package_contents(&database, &package_contents)
            .expect("installed bundled curriculum");

        let catalog = get_catalog(&database).expect("curriculum catalog");
        assert_eq!(catalog.packages.len(), 1);
        assert_eq!(catalog.packages[0].origin, CurriculumPackageOrigin::Bundled);
        assert_eq!(catalog.packages[0].trust, CurriculumPackageTrust::School);
        assert_eq!(catalog.packages[0].edition, "September 2025");
        let counts = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row("SELECT COUNT(*) FROM curriculum_nodes", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM atomic_learning_objectives",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_components",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM curriculum_source_links",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_component_objectives",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_components
                         WHERE knowledge_type IS NULL",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("bundled curriculum counts");
        assert_eq!(counts, (208, 158, 118, 1_240, 274, 0));

        let ordering_component = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT knowledge_components.knowledge_type,
                            (SELECT GROUP_CONCAT(source_code, ',')
                             FROM (
                                 SELECT atomic_learning_objectives.source_code
                                 FROM knowledge_component_objectives
                                 JOIN atomic_learning_objectives
                                   ON atomic_learning_objectives.id = knowledge_component_objectives.atomic_objective_id
                                 WHERE knowledge_component_objectives.knowledge_component_id = knowledge_components.id
                                 ORDER BY atomic_learning_objectives.sequence,
                                          atomic_learning_objectives.source_code
                             ))
                     FROM knowledge_components
                     WHERE knowledge_components.code = 'JSS1-GMATH-FR-005'",
                    [],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
            })
            .expect("ordering-fractions knowledge component");
        assert_eq!(ordering_component.0, "procedure");
        assert_eq!(
            ordering_component.1,
            "ordering-of-fractions-ao-arrange-ascending,ordering-of-fractions-ao-arrange-descending"
        );
    }

    #[test]
    fn reinstalling_the_exact_package_is_idempotent() {
        let database = Database::in_memory();
        install_school_test_package(&database);
        let catalog = install_school_test_package(&database);

        assert_eq!(catalog.packages.len(), 1);
        assert_eq!(catalog.courses.len(), 1);
    }

    #[test]
    fn rejects_changed_content_for_an_installed_identity_and_edition() {
        let database = Database::in_memory();
        install_school_test_package(&database);
        let mut changed = test_school_package_payload();
        changed["title"] = serde_json::json!("Changed title");

        let error = install_package(
            &database,
            InstallCurriculumPackageRequest {
                package_contents: test_school_package_contents(&changed),
            },
        )
        .expect_err("identity conflict");

        assert!(error.contains("different curriculum file"));
    }

    #[test]
    fn rejects_a_package_for_an_unknown_jurisdiction_without_partial_rows() {
        let database = Database::in_memory();
        let mut payload = test_school_package_payload();
        payload["countryCode"] = serde_json::json!("ZZ");
        payload["jurisdictionCode"] = serde_json::json!("ZZ");

        let error = install_package(
            &database,
            InstallCurriculumPackageRequest {
                package_contents: test_school_package_contents(&payload),
            },
        )
        .expect_err("unsupported jurisdiction");

        assert!(error.contains("country or region"));
        let package_count = database
            .with_connection(|connection| {
                connection.query_row("SELECT COUNT(*) FROM curriculum_packages", [], |row| {
                    row.get::<_, i64>(0)
                })
            })
            .expect("package count");
        assert_eq!(package_count, 0);
    }

    #[test]
    fn installed_curriculum_content_is_immutable() {
        let database = Database::in_memory();
        install_school_test_package(&database);

        let error = database
            .with_connection(|connection| {
                connection.execute("UPDATE curriculum_nodes SET title = 'Changed'", [])
            })
            .expect_err("immutable node");

        assert!(error.contains("immutable"));
    }

    #[test]
    fn binds_only_a_course_matching_the_assignment() {
        let database = Database::in_memory();
        let course_id = install_school_test_package(&database).courses[0].id.clone();
        let workspace = create_workspace(
            &database,
            CreateAcademicWorkspaceRequest {
                start_year: 2026,
                jurisdiction_id: "jurisdiction-ng".to_owned(),
                grade_system_id: "grade-system-ng-basic-secondary".to_owned(),
                calendar_kind: AcademicCalendarKind::Terms,
                period_names: vec![
                    "First term".to_owned(),
                    "Second term".to_owned(),
                    "Third term".to_owned(),
                ],
                active_period_ordinal: 1,
                assignments: vec![CreateTeachingAssignment {
                    subject: "Mathematics".to_owned(),
                    grade_level_id: "grade-jss-1".to_owned(),
                    class_section: Some("A".to_owned()),
                }],
            },
        )
        .expect("academic workspace")
        .workspace
        .expect("configured workspace");
        assign_course(
            &database,
            AssignCurriculumCourseRequest {
                assignment_id: workspace.active_assignment_id.clone(),
                curriculum_course_id: course_id.clone(),
            },
        )
        .expect("matching curriculum");
        let saved_course_id = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT curriculum_course_id FROM teaching_assignments WHERE id = ?1",
                    params![workspace.active_assignment_id],
                    |row| row.get::<_, String>(0),
                )
            })
            .expect("assigned curriculum");
        assert_eq!(saved_course_id, course_id);

        let snapshot = add_assignment(
            &database,
            SaveTeachingAssignmentRequest {
                academic_session_id: workspace.active_session_id,
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: Some("B".to_owned()),
            },
        )
        .expect("second class");
        let other_assignment = snapshot
            .workspace
            .expect("workspace")
            .assignments
            .into_iter()
            .find(|assignment| assignment.grade_level_id == "grade-jss-2")
            .expect("second assignment");
        let error = assign_course(
            &database,
            AssignCurriculumCourseRequest {
                assignment_id: other_assignment.id,
                curriculum_course_id: course_id,
            },
        )
        .expect_err("mismatched class level");
        assert!(error.contains("same subject and class level"));
    }
}
