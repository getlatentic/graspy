use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AcademicCalendarKind {
    Terms,
    Semesters,
    Quarters,
    Custom,
}

impl AcademicCalendarKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Terms => "terms",
            Self::Semesters => "semesters",
            Self::Quarters => "quarters",
            Self::Custom => "custom",
        }
    }

    pub fn period_kind(self) -> AcademicPeriodKind {
        match self {
            Self::Terms => AcademicPeriodKind::Term,
            Self::Semesters => AcademicPeriodKind::Semester,
            Self::Quarters => AcademicPeriodKind::Quarter,
            Self::Custom => AcademicPeriodKind::Custom,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum AcademicPeriodKind {
    Term,
    Semester,
    Quarter,
    Custom,
}

impl AcademicPeriodKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Term => "term",
            Self::Semester => "semester",
            Self::Quarter => "quarter",
            Self::Custom => "custom",
        }
    }

    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "term" => Ok(Self::Term),
            "semester" => Ok(Self::Semester),
            "quarter" => Ok(Self::Quarter),
            "custom" => Ok(Self::Custom),
            _ => Err("The saved academic period type is not supported.".to_owned()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcademicWorkspaceSnapshot {
    pub workspace: Option<AcademicWorkspace>,
    pub subjects: Vec<SubjectOption>,
    pub grade_levels: Vec<GradeLevel>,
    pub jurisdictions: Vec<JurisdictionOption>,
    pub grade_systems: Vec<GradeSystem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcademicWorkspace {
    pub school: SchoolProfile,
    pub sessions: Vec<AcademicSession>,
    pub periods: Vec<AcademicPeriod>,
    pub assignments: Vec<TeachingAssignment>,
    pub active_session_id: String,
    pub active_period_id: String,
    pub active_assignment_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchoolProfile {
    pub jurisdiction_id: String,
    pub jurisdiction: String,
    pub country_code: String,
    pub grade_system_id: String,
    pub grade_system: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JurisdictionOption {
    pub id: String,
    pub country_code: String,
    pub country: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GradeSystem {
    pub id: String,
    pub jurisdiction_id: String,
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcademicSession {
    pub id: String,
    pub start_year: i64,
    pub end_year: i64,
    pub label: String,
    pub calendar_kind: AcademicCalendarKind,
    pub status: AcademicSessionStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AcademicPeriod {
    pub id: String,
    pub academic_session_id: String,
    pub ordinal: i64,
    pub name: String,
    pub kind: AcademicPeriodKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum AcademicSessionStatus {
    Open,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubjectOption {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GradeLevel {
    pub id: String,
    pub grade_system_id: String,
    pub code: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TeachingAssignment {
    pub id: String,
    pub academic_session_id: String,
    pub subject_id: String,
    pub subject: String,
    pub grade_level_id: String,
    pub grade_level: String,
    pub class_section: Option<String>,
    pub display_name: String,
    pub curriculum_course_id: Option<String>,
    pub curriculum_title: Option<String>,
    pub curriculum_publisher: Option<String>,
    pub curriculum_trust: Option<String>,
    pub status: TeachingAssignmentStatus,
    /// Lessons the teacher has planned for this class, and how many of those
    /// they have confirmed as ready. The home and class views show the pair.
    pub lessons_total: i64,
    pub lessons_ready: i64,
    /// Where the class stands in its adopted scheme of work for the active term:
    /// the week covering today (or the nearest one) and the first lesson in it.
    /// Absent when the class has no scheme adopted for the term.
    pub current_week: Option<SchemeWeekSummary>,
    pub next_lesson: Option<NextLessonSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchemeWeekSummary {
    pub ordinal: i64,
    pub title: Option<String>,
    /// Where today falls against this week's term.
    pub standing: TermStanding,
}

/// Where today sits in a term, so a card can say it rather than imply it.
///
/// A term whose weeks have all ended used to fall back to its first week and
/// show it as though it were now — a class card read "WEEK 1" eight months
/// after the term closed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum TermStanding {
    /// Today is inside this week.
    ThisWeek,
    /// The term has not started; this is the week it starts on.
    NotStarted,
    /// Every week has ended; this is the last one taught.
    Finished,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NextLessonSummary {
    pub topic: String,
    pub subtopic: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum TeachingAssignmentStatus {
    Active,
    Archived,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAcademicWorkspaceRequest {
    pub start_year: i64,
    pub jurisdiction_id: String,
    pub grade_system_id: String,
    pub calendar_kind: AcademicCalendarKind,
    pub period_names: Vec<String>,
    pub active_period_ordinal: i64,
    /// Everything the teacher said they teach. The first is the active one.
    pub assignments: Vec<CreateTeachingAssignment>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateTeachingAssignment {
    pub subject: String,
    pub grade_level_id: String,
    pub class_section: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateAcademicSessionRequest {
    pub start_year: i64,
    pub calendar_kind: AcademicCalendarKind,
    pub period_names: Vec<String>,
    pub active_period_ordinal: i64,
    pub subject: String,
    pub grade_level_id: String,
    pub class_section: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveTeachingAssignmentRequest {
    pub academic_session_id: String,
    pub subject: String,
    pub grade_level_id: String,
    pub class_section: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTeachingAssignmentRequest {
    pub assignment_id: String,
    pub subject: String,
    pub grade_level_id: String,
    pub class_section: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetActiveAcademicContextRequest {
    pub academic_session_id: String,
    pub academic_period_id: String,
    pub assignment_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedAcademicCalendar {
    pub kind: AcademicCalendarKind,
    pub periods: Vec<ValidatedAcademicPeriod>,
    pub active_period_ordinal: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedAcademicPeriod {
    pub ordinal: i64,
    pub name: String,
    pub normalized_name: String,
    pub kind: AcademicPeriodKind,
}

impl ValidatedAcademicCalendar {
    pub fn new(
        kind: AcademicCalendarKind,
        period_names: &[String],
        active_period_ordinal: i64,
    ) -> Result<Self, String> {
        let expected_count = match kind {
            AcademicCalendarKind::Semesters => Some(2),
            AcademicCalendarKind::Quarters => Some(4),
            AcademicCalendarKind::Terms | AcademicCalendarKind::Custom => None,
        };
        if let Some(expected_count) = expected_count {
            if period_names.len() != expected_count {
                return Err(format!(
                    "{} require exactly {expected_count} academic periods.",
                    match kind {
                        AcademicCalendarKind::Semesters => "Semesters",
                        AcademicCalendarKind::Quarters => "Quarters",
                        _ => unreachable!(),
                    }
                ));
            }
        }
        if period_names.is_empty() || period_names.len() > 12 {
            return Err("Add between 1 and 12 academic periods.".to_owned());
        }
        if kind == AcademicCalendarKind::Terms && !(2..=4).contains(&period_names.len()) {
            return Err("A term calendar must contain between 2 and 4 terms.".to_owned());
        }
        if active_period_ordinal < 1 || active_period_ordinal > period_names.len() as i64 {
            return Err("Choose an academic period from this calendar.".to_owned());
        }

        let mut normalized_names = std::collections::HashSet::new();
        let periods = period_names
            .iter()
            .enumerate()
            .map(|(index, value)| {
                let name = normalize_display_text(value);
                if name.is_empty() || name.chars().count() > 80 {
                    return Err(
                        "Keep every academic period name between 1 and 80 characters.".to_owned(),
                    );
                }
                let normalized_name = normalize_key(&name);
                if !normalized_names.insert(normalized_name.clone()) {
                    return Err("Academic period names must be unique.".to_owned());
                }
                Ok(ValidatedAcademicPeriod {
                    ordinal: index as i64 + 1,
                    name,
                    normalized_name,
                    kind: kind.period_kind(),
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self {
            kind,
            periods,
            active_period_ordinal,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedAssignmentInput {
    pub subject: String,
    pub normalized_subject: String,
    pub grade_level_id: String,
    pub class_section: Option<String>,
    pub class_section_key: String,
}

impl ValidatedAssignmentInput {
    pub fn new(
        subject: &str,
        grade_level_id: &str,
        class_section: Option<&str>,
    ) -> Result<Self, String> {
        let subject = normalize_display_text(subject);
        if subject.is_empty() || subject.chars().count() > 100 {
            return Err("Enter a subject between 1 and 100 characters.".to_owned());
        }

        let grade_level_id = grade_level_id.trim().to_owned();
        if grade_level_id.is_empty() {
            return Err("Choose a grade level.".to_owned());
        }

        let class_section = class_section
            .map(normalize_display_text)
            .filter(|section| !section.is_empty());
        if class_section
            .as_ref()
            .is_some_and(|section| section.chars().count() > 50)
        {
            return Err("Keep the class or section label under 50 characters.".to_owned());
        }

        Ok(Self {
            normalized_subject: normalize_key(&subject),
            subject,
            grade_level_id,
            class_section_key: class_section
                .as_deref()
                .map(normalize_key)
                .unwrap_or_default(),
            class_section,
        })
    }
}

pub fn validate_start_year(start_year: i64) -> Result<i64, String> {
    if !(1900..=9998).contains(&start_year) {
        return Err("Enter an academic session start year between 1900 and 9998.".to_owned());
    }
    Ok(start_year + 1)
}

fn normalize_display_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_key(value: &str) -> String {
    normalize_display_text(value).to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_assignment_identity_without_losing_display_text() {
        let input = ValidatedAssignmentInput::new(
            "  Further   Mathematics ",
            "grade-jss-2",
            Some("  Blue   Team "),
        )
        .expect("valid assignment");

        assert_eq!(input.subject, "Further Mathematics");
        assert_eq!(input.normalized_subject, "further mathematics");
        assert_eq!(input.class_section.as_deref(), Some("Blue Team"));
        assert_eq!(input.class_section_key, "blue team");
    }

    #[test]
    fn derives_a_consecutive_session_end_year() {
        assert_eq!(validate_start_year(2026), Ok(2027));
    }

    #[test]
    fn validates_three_term_semester_quarter_and_custom_calendars() {
        let three_terms = ValidatedAcademicCalendar::new(
            AcademicCalendarKind::Terms,
            &[
                "First term".to_owned(),
                "Second term".to_owned(),
                "Third term".to_owned(),
            ],
            1,
        )
        .expect("three terms");
        assert_eq!(three_terms.periods.len(), 3);
        assert_eq!(three_terms.periods[0].kind, AcademicPeriodKind::Term);

        let semesters = ValidatedAcademicCalendar::new(
            AcademicCalendarKind::Semesters,
            &["Fall semester".to_owned(), "Spring semester".to_owned()],
            2,
        )
        .expect("semesters");
        assert_eq!(semesters.periods[1].kind, AcademicPeriodKind::Semester);

        let quarters = ValidatedAcademicCalendar::new(
            AcademicCalendarKind::Quarters,
            &[
                "Q1".to_owned(),
                "Q2".to_owned(),
                "Q3".to_owned(),
                "Q4".to_owned(),
            ],
            4,
        )
        .expect("quarters");
        assert_eq!(quarters.periods[3].ordinal, 4);

        let custom = ValidatedAcademicCalendar::new(
            AcademicCalendarKind::Custom,
            &["Autumn block".to_owned()],
            1,
        )
        .expect("custom calendar");
        assert_eq!(custom.periods[0].kind, AcademicPeriodKind::Custom);
    }

    #[test]
    fn rejects_duplicate_period_names_after_normalization() {
        let error = ValidatedAcademicCalendar::new(
            AcademicCalendarKind::Semesters,
            &[" Fall semester ".to_owned(), "fall   semester".to_owned()],
            1,
        )
        .expect_err("duplicates must fail");

        assert!(error.contains("unique"));
    }
}
