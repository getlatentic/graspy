use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumCatalogSnapshot {
    pub packages: Vec<CurriculumPackageSummary>,
    pub courses: Vec<CurriculumCourseOption>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumPackageSummary {
    pub id: String,
    pub title: String,
    pub publisher: String,
    pub jurisdiction_id: String,
    pub jurisdiction: String,
    pub edition: String,
    pub rights_name: String,
    pub attribution: String,
    pub trust: CurriculumPackageTrust,
    pub origin: CurriculumPackageOrigin,
    pub installed_at: String,
    /// How many earlier conversions of this same curriculum are still
    /// installed. They stay because lessons already cite them, and a teacher is
    /// owed that fact rather than a second identical row.
    pub earlier_versions_kept: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumCourseOption {
    pub id: String,
    pub package_id: String,
    pub jurisdiction_id: String,
    pub framework: String,
    pub subject_id: String,
    pub subject: String,
    pub grade_level_id: String,
    pub grade_level: String,
    pub title: String,
    pub publisher: String,
    pub edition: String,
    pub trust: CurriculumPackageTrust,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum CurriculumPackageTrust {
    Verified,
    School,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum CurriculumPackageOrigin {
    Bundled,
    Imported,
}

impl CurriculumPackageOrigin {
    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "bundled" => Ok(Self::Bundled),
            "imported" => Ok(Self::Imported),
            _ => Err("The saved curriculum origin is not supported.".to_owned()),
        }
    }
}

impl CurriculumPackageTrust {
    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "verified" => Ok(Self::Verified),
            "school" => Ok(Self::School),
            _ => Err("The saved curriculum trust level is not supported.".to_owned()),
        }
    }
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstallCurriculumPackageRequest {
    pub package_contents: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AssignCurriculumCourseRequest {
    pub assignment_id: String,
    pub curriculum_course_id: String,
}
