use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeContextSnapshot {
    pub scheme: Option<SchemeOfWork>,
    pub available_templates: Vec<SchemeTemplateSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeOfWork {
    pub id: String,
    pub title: String,
    pub origin_template_id: Option<String>,
    pub academic_session_id: String,
    pub academic_period_id: String,
    pub academic_period_name: String,
    pub teaching_assignment_id: String,
    pub curriculum: CurriculumCourse,
    pub calendar: TermCalendar,
    pub weeks: Vec<SchemeWeek>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SchemeTemplateTrust {
    Verified,
    School,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SchemeTemplateOrigin {
    Bundled,
    Imported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeTemplateSummary {
    pub id: String,
    pub title: String,
    pub publisher: String,
    pub jurisdiction: String,
    pub edition: String,
    pub trust: SchemeTemplateTrust,
    pub origin: SchemeTemplateOrigin,
    pub week_count: i64,
    pub plan_count: i64,
    pub weeks: Vec<SchemeTemplateWeekPreview>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeTemplateWeekPreview {
    pub ordinal: i64,
    pub kind: SchemeWeekKind,
    pub title: Option<String>,
    pub topics: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumCourse {
    pub id: String,
    pub title: String,
    pub subject: String,
    pub grade_level: String,
    pub framework: CurriculumFramework,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumFramework {
    pub id: String,
    pub name: String,
    pub authority: String,
    pub jurisdiction: String,
    pub version: String,
    pub source_uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TermCalendar {
    pub starts_on: String,
    pub ends_on: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SchemeWeekKind {
    Teaching,
    Revision,
    Test,
    Break,
    Examination,
}

impl SchemeWeekKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Teaching => "teaching",
            Self::Revision => "revision",
            Self::Test => "test",
            Self::Break => "break",
            Self::Examination => "examination",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeWeek {
    pub id: String,
    pub ordinal: i64,
    pub starts_on: String,
    pub ends_on: String,
    pub kind: SchemeWeekKind,
    pub title: Option<String>,
    pub entries: Vec<SchemeEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeEntry {
    pub id: String,
    pub sequence: i64,
    pub topic: String,
    pub subtopic: Option<String>,
    pub curriculum_unit: CurriculumUnit,
    pub curriculum_outcomes: Vec<CurriculumOutcome>,
    pub objectives: Vec<String>,
    pub assessment: Vec<String>,
    pub instructional_materials: Vec<String>,
    pub notes: Option<String>,
    /// The lesson written from this weekly plan, where one already exists.
    ///
    /// A weekly plan carries at most one lesson — `idx_lessons_scheme_entry`
    /// holds that — so a screen offering to start a second one is offering
    /// something the library will refuse. Carrying the lesson here is what lets
    /// the term plan offer the way into it instead.
    pub planned_lesson_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumUnit {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumOutcome {
    pub id: String,
    pub statement: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeContextRequest {
    pub academic_session_id: String,
    pub academic_period_id: String,
    pub teaching_assignment_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSchemeOfWorkRequest {
    pub context: SchemeContextRequest,
    #[serde(default)]
    pub framework_name: String,
    #[serde(default)]
    pub authority: String,
    #[serde(default)]
    pub jurisdiction: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub source_uri: Option<String>,
    pub term_starts_on: String,
    pub term_ends_on: String,
    #[serde(default)]
    pub mid_term_break_starts_on: Option<String>,
    #[serde(default)]
    pub mid_term_break_ends_on: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstallSchemeTemplatePackageRequest {
    pub context: SchemeContextRequest,
    pub package_contents: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSchemeFromTemplateRequest {
    pub context: SchemeContextRequest,
    pub template_id: String,
    pub term_starts_on: String,
    pub term_ends_on: String,
    #[serde(default)]
    pub mid_term_break_starts_on: Option<String>,
    #[serde(default)]
    pub mid_term_break_ends_on: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveSchemeWeekRequest {
    pub context: SchemeContextRequest,
    pub week_id: String,
    pub kind: SchemeWeekKind,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveSchemeEntryRequest {
    pub context: SchemeContextRequest,
    pub entry_id: Option<String>,
    pub week_id: String,
    pub topic: String,
    pub subtopic: Option<String>,
    pub curriculum_unit: String,
    pub curriculum_outcomes: Vec<String>,
    pub objectives: Vec<String>,
    pub assessment: Vec<String>,
    pub instructional_materials: Vec<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSchemeEntryRequest {
    pub context: SchemeContextRequest,
    pub entry_id: String,
}

/// Moving a subtopic to the week a teacher will actually teach it in.
///
/// A class that falls behind — which is every class — has to be able to say so,
/// because the scheme is what the week's plan is written against.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveSchemeEntryRequest {
    pub context: SchemeContextRequest,
    pub entry_id: String,
    pub target_week_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedSchemeSetup {
    pub framework_name: String,
    pub normalized_framework_name: String,
    pub authority: String,
    pub normalized_authority: String,
    pub jurisdiction: String,
    pub version: String,
    pub source_uri: Option<String>,
    pub starts_on: NaiveDate,
    pub ends_on: NaiveDate,
}

/// A term as a school keeps it: the day it resumes, the day it closes, and the
/// mid-term break in between.
///
/// The break is optional because not every term has one, and a term that does
/// not is a term rather than a term missing something. It is held here rather
/// than beside the weeks it affects so that both ways of starting a scheme —
/// from a template and from nothing — read the same calendar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ValidatedTermDates {
    pub starts_on: NaiveDate,
    pub ends_on: NaiveDate,
    pub mid_term_break: Option<MidTermBreak>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MidTermBreak {
    pub starts_on: NaiveDate,
    pub ends_on: NaiveDate,
}

impl ValidatedTermDates {
    pub fn new(
        starts_on: &str,
        ends_on: &str,
        break_starts_on: Option<&str>,
        break_ends_on: Option<&str>,
    ) -> Result<Self, String> {
        let starts_on = parse_date(starts_on, "resumption")?;
        let ends_on = parse_date(ends_on, "closing")?;
        let days = ends_on.signed_duration_since(starts_on).num_days();
        if days < 0 {
            return Err("The term must close on or after the day it resumes.".to_owned());
        }
        if days > 217 {
            return Err("A term cannot be longer than 31 weeks.".to_owned());
        }
        Ok(Self {
            starts_on,
            ends_on,
            mid_term_break: mid_term_break(starts_on, ends_on, break_starts_on, break_ends_on)?,
        })
    }

    /// Whether a week of the term is lost to the mid-term break.
    ///
    /// A week most of which is holiday is a break week; one that loses a day or
    /// two at its edge is still taught, so its topic still belongs to it.
    pub fn is_break_week(&self, week_starts_on: NaiveDate, week_ends_on: NaiveDate) -> bool {
        let Some(break_dates) = self.mid_term_break else {
            return false;
        };
        let first = std::cmp::max(week_starts_on, break_dates.starts_on);
        let last = std::cmp::min(week_ends_on, break_dates.ends_on);
        let shared = last.signed_duration_since(first).num_days() + 1;
        let week = week_ends_on
            .signed_duration_since(week_starts_on)
            .num_days()
            + 1;
        shared > 0 && shared * 2 > week
    }
}

fn mid_term_break(
    term_starts_on: NaiveDate,
    term_ends_on: NaiveDate,
    starts_on: Option<&str>,
    ends_on: Option<&str>,
) -> Result<Option<MidTermBreak>, String> {
    let (Some(starts_on), Some(ends_on)) = (starts_on, ends_on) else {
        if starts_on.is_some() || ends_on.is_some() {
            return Err("Give both the first and the last day of the mid-term break.".to_owned());
        }
        return Ok(None);
    };
    let starts_on = parse_date(starts_on, "mid-term break start")?;
    let ends_on = parse_date(ends_on, "mid-term break end")?;
    if ends_on < starts_on {
        return Err("The mid-term break must end on or after the day it starts.".to_owned());
    }
    if starts_on < term_starts_on || ends_on > term_ends_on {
        return Err(
            "The mid-term break must fall between the day the term resumes and the day it closes."
                .to_owned(),
        );
    }
    Ok(Some(MidTermBreak { starts_on, ends_on }))
}

impl ValidatedSchemeSetup {
    pub fn new(request: &CreateSchemeOfWorkRequest) -> Result<Self, String> {
        let framework_name = required_text(&request.framework_name, "curriculum name", 120)?;
        let authority = required_text(&request.authority, "curriculum authority", 120)?;
        let jurisdiction = required_text(&request.jurisdiction, "jurisdiction", 120)?;
        let version = required_text(&request.version, "curriculum version", 80)?;
        let source_uri = optional_text(request.source_uri.as_deref(), 500)?;
        if source_uri
            .as_deref()
            .is_some_and(|uri| !uri.starts_with("https://") && !uri.starts_with("http://"))
        {
            return Err("The curriculum source must be an http or https address.".to_owned());
        }
        let dates = ValidatedTermDates::new(
            &request.term_starts_on,
            &request.term_ends_on,
            request.mid_term_break_starts_on.as_deref(),
            request.mid_term_break_ends_on.as_deref(),
        )?;

        Ok(Self {
            normalized_framework_name: normalize_key(&framework_name),
            framework_name,
            normalized_authority: normalize_key(&authority),
            authority,
            jurisdiction,
            version,
            source_uri,
            starts_on: dates.starts_on,
            ends_on: dates.ends_on,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedSchemeEntry {
    pub topic: String,
    pub subtopic: Option<String>,
    pub curriculum_unit: String,
    pub normalized_curriculum_unit: String,
    pub curriculum_outcomes: Vec<String>,
    pub objectives: Vec<String>,
    pub assessment: Vec<String>,
    pub instructional_materials: Vec<String>,
    pub notes: Option<String>,
}

impl ValidatedSchemeEntry {
    pub fn new(request: &SaveSchemeEntryRequest) -> Result<Self, String> {
        let curriculum_unit = required_text(&request.curriculum_unit, "curriculum unit", 160)?;
        Ok(Self {
            topic: required_text(&request.topic, "topic", 160)?,
            subtopic: optional_text(request.subtopic.as_deref(), 160)?,
            normalized_curriculum_unit: normalize_key(&curriculum_unit),
            curriculum_unit,
            curriculum_outcomes: required_list(
                &request.curriculum_outcomes,
                "curriculum outcome",
                12,
                500,
            )?,
            objectives: required_list(&request.objectives, "objective", 12, 500)?,
            assessment: required_list(&request.assessment, "assessment item", 12, 500)?,
            instructional_materials: clean_list(
                &request.instructional_materials,
                "material",
                20,
                200,
            )?,
            notes: optional_text(request.notes.as_deref(), 2_000)?,
        })
    }
}

pub fn validate_week_title(
    kind: SchemeWeekKind,
    title: Option<&str>,
) -> Result<Option<String>, String> {
    let title = optional_text(title, 100)?;
    if kind != SchemeWeekKind::Teaching && title.is_none() {
        return Err("Name the non-teaching week.".to_owned());
    }
    Ok(title)
}

fn parse_date(value: &str, label: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| format!("Enter a valid {label} date."))
}

pub(super) fn required_text(value: &str, label: &str, max: usize) -> Result<String, String> {
    let value = normalize_display(value);
    if value.is_empty() || value.chars().count() > max {
        return Err(format!("Enter a {label} between 1 and {max} characters."));
    }
    Ok(value)
}

pub(super) fn optional_text(value: Option<&str>, max: usize) -> Result<Option<String>, String> {
    let value = value
        .map(normalize_display)
        .filter(|value| !value.is_empty());
    if value
        .as_ref()
        .is_some_and(|value| value.chars().count() > max)
    {
        return Err(format!("Keep this value under {max} characters."));
    }
    Ok(value)
}

pub(super) fn required_list(
    values: &[String],
    label: &str,
    max_items: usize,
    max_chars: usize,
) -> Result<Vec<String>, String> {
    let values = clean_list(values, label, max_items, max_chars)?;
    if values.is_empty() {
        return Err(format!("Add at least one {label}."));
    }
    Ok(values)
}

pub(super) fn clean_list(
    values: &[String],
    label: &str,
    max_items: usize,
    max_chars: usize,
) -> Result<Vec<String>, String> {
    let values = values
        .iter()
        .map(|value| normalize_display(value))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if values.len() > max_items || values.iter().any(|value| value.chars().count() > max_chars) {
        return Err(format!(
            "Keep {label}s to {max_items} items and {max_chars} characters each."
        ));
    }
    Ok(values)
}

pub fn normalize_key(value: &str) -> String {
    normalize_display(value).to_lowercase()
}

pub(super) fn normalize_display(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_normalizes_scheme_setup() {
        let setup = ValidatedSchemeSetup::new(&CreateSchemeOfWorkRequest {
            context: SchemeContextRequest {
                academic_session_id: "session".to_owned(),
                academic_period_id: "period".to_owned(),
                teaching_assignment_id: "assignment".to_owned(),
            },
            framework_name: "  School   Curriculum ".to_owned(),
            authority: " Curriculum Office ".to_owned(),
            jurisdiction: "Nigeria".to_owned(),
            version: "2026".to_owned(),
            source_uri: Some("https://example.edu/curriculum".to_owned()),
            term_starts_on: "2026-09-07".to_owned(),
            term_ends_on: "2026-12-18".to_owned(),
            mid_term_break_starts_on: None,
            mid_term_break_ends_on: None,
        })
        .expect("valid setup");

        assert_eq!(setup.framework_name, "School Curriculum");
        assert_eq!(setup.normalized_framework_name, "school curriculum");
        assert_eq!(setup.starts_on.to_string(), "2026-09-07");
    }

    #[test]
    fn rejects_an_inverted_term() {
        let error = ValidatedSchemeSetup::new(&CreateSchemeOfWorkRequest {
            context: SchemeContextRequest {
                academic_session_id: "session".to_owned(),
                academic_period_id: "period".to_owned(),
                teaching_assignment_id: "assignment".to_owned(),
            },
            framework_name: "School Curriculum".to_owned(),
            authority: "School".to_owned(),
            jurisdiction: "Nigeria".to_owned(),
            version: "2026".to_owned(),
            source_uri: None,
            term_starts_on: "2026-12-18".to_owned(),
            term_ends_on: "2026-09-07".to_owned(),
            mid_term_break_starts_on: None,
            mid_term_break_ends_on: None,
        })
        .expect_err("inverted term");

        assert!(error.contains("close on or after"), "unexpected: {error}");
    }
}
