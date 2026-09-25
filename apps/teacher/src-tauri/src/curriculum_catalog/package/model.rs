use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;

use crate::content_rights::ContentRightsBasis;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::curriculum_catalog) enum PackageTrust {
    Verified,
    School,
}

#[derive(Debug, Clone, PartialEq)]
pub(in crate::curriculum_catalog) struct ValidatedCurriculumPackage {
    pub payload: CurriculumPackagePayload,
    pub payload_sha256: String,
    pub payload_json: String,
    pub trust: PackageTrust,
    pub signer_key_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackagePayload {
    pub package_id: String,
    pub title: String,
    pub publisher: String,
    pub country_code: String,
    pub jurisdiction_code: String,
    pub edition: String,
    /// Which graspy conversion of this edition. A payload that predates the
    /// field is the first one, so an existing package keeps its identity.
    #[serde(default = "first_package_revision")]
    pub package_revision: i64,
    pub effective_from: Option<String>,
    pub effective_to: Option<String>,
    pub source_url: String,
    pub source_sha256: String,
    #[serde(default)]
    pub dataset_sha256: Option<String>,
    #[serde(default)]
    pub revision_overlay_sha256: Option<String>,
    #[serde(default)]
    pub licence: Option<CurriculumPackageLicence>,
    #[serde(default)]
    pub rights_basis: Option<ContentRightsBasis>,
    #[serde(default)]
    pub attribution: Option<String>,
    pub modification_notice: String,
    pub framework: CurriculumPackageFramework,
    pub node_kinds: Vec<String>,
    pub courses: Vec<CurriculumPackageCourse>,
    #[serde(default)]
    pub integrity: Option<CurriculumPackageIntegrity>,
}

fn first_package_revision() -> i64 {
    1
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageIntegrity {
    pub themes: usize,
    pub topics: usize,
    pub subtopics: usize,
    pub performance_objectives: usize,
    pub atomic_objectives: usize,
    pub knowledge_components: usize,
    pub source_links: usize,
    pub atomic_objectives_with_sources: usize,
    pub atomic_objectives_without_sources: usize,
    pub subtopics_with_sources: usize,
    pub subtopics_without_sources: usize,
    pub linkage_states: HashMap<String, usize>,
    #[serde(default)]
    pub source_link_corrections: usize,
    #[serde(default)]
    pub source_topics: usize,
    #[serde(default)]
    pub source_pages: usize,
    #[serde(default)]
    pub golden_lessons: usize,
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageLicence {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub attribution: Option<String>,
}

impl CurriculumPackagePayload {
    pub(in crate::curriculum_catalog) fn rights_basis(&self) -> &ContentRightsBasis {
        self.rights_basis
            .as_ref()
            .expect("validated curriculum packages always contain a rights basis")
    }

    pub(in crate::curriculum_catalog) fn attribution(&self) -> &str {
        self.attribution
            .as_deref()
            .expect("validated curriculum packages always contain attribution")
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageFramework {
    pub name: String,
    pub authority: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageCourse {
    pub course_key: String,
    pub title: String,
    pub subject: String,
    pub grade_system_code: String,
    pub grade_system_version: String,
    pub grade_level_code: String,
    pub nodes: Vec<CurriculumPackageNode>,
    pub objectives: Vec<CurriculumPackageObjective>,
    pub knowledge_components: Vec<CurriculumPackageKnowledgeComponent>,
    pub prerequisites: Vec<CurriculumPackagePrerequisite>,
    #[serde(default)]
    pub source_links: Vec<CurriculumPackageSourceLink>,
    #[serde(default)]
    pub uncovered_objective_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageNode {
    pub code: String,
    pub parent_code: Option<String>,
    pub kind: String,
    pub title: String,
    pub statement: Option<String>,
    pub sequence: i64,
    #[serde(default)]
    pub source_payload: Value,
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageObjective {
    pub code: String,
    pub node_code: String,
    pub statement: String,
    pub bloom_verb: Option<String>,
    pub bloom_level: Option<String>,
    pub sequence: i64,
}

#[derive(Debug, Clone, PartialEq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageKnowledgeComponent {
    pub code: String,
    #[serde(default)]
    pub objective_code: Option<String>,
    #[serde(default)]
    pub node_code: Option<String>,
    #[serde(default)]
    pub objective_codes: Vec<String>,
    pub description: String,
    pub bloom_level: Option<String>,
    pub knowledge_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackageSourceLink {
    pub target_kind: CurriculumSourceTargetKind,
    pub target_code: String,
    pub record_id: String,
    pub role: String,
    pub method: String,
    pub rationale: String,
    pub sequence: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub(in crate::curriculum_catalog) enum CurriculumSourceTargetKind {
    Node,
    Objective,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::curriculum_catalog) struct CurriculumPackagePrerequisite {
    pub component_code: String,
    pub prerequisite_code: String,
}
