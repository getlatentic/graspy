use serde::{Deserialize, Serialize};

use crate::lesson_planning::LessonContextRequest;

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonEvidenceWorkspaceRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveLessonEvidenceRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub lesson_version_id: String,
    pub expected_revision: Option<i64>,
    pub status: EvidenceStatus,
    pub groups: Vec<EvidenceGroupInput>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceGroupInput {
    pub id: Option<String>,
    pub position: i64,
    pub name: String,
    pub interest_score: Option<i64>,
    pub lesson_feeling_score: Option<i64>,
    pub entries: Vec<EvidenceEntryInput>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceEntryInput {
    pub learning_goal_number: i64,
    pub questions_correct: Option<i64>,
    pub questions_total: Option<i64>,
    pub misunderstanding_note: Option<String>,
    pub confidence_score: Option<i64>,
    pub difficulty_score: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum EvidenceStatus {
    Draft,
    Complete,
}

impl EvidenceStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Complete => "complete",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonEvidenceWorkspaceSnapshot {
    pub lesson: EvidenceLesson,
    pub evidence: Option<LessonEvidenceSet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceLesson {
    pub lesson_id: String,
    pub lesson_version_id: String,
    pub lesson_version_number: i64,
    pub topic: String,
    pub learning_goals: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonEvidenceSet {
    pub id: String,
    pub status: EvidenceStatus,
    pub revision: i64,
    pub groups: Vec<EvidenceGroup>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceGroup {
    pub id: String,
    pub position: i64,
    pub name: String,
    pub interest_score: Option<i64>,
    pub lesson_feeling_score: Option<i64>,
    pub entries: Vec<EvidenceEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceEntry {
    pub learning_goal_number: i64,
    pub questions_correct: Option<i64>,
    pub questions_total: Option<i64>,
    pub misunderstanding_note: Option<String>,
    pub confidence_score: Option<i64>,
    pub difficulty_score: Option<i64>,
}

#[derive(Debug)]
pub(super) struct ValidatedEvidenceGroup {
    pub id: Option<String>,
    pub position: i64,
    pub name: String,
    pub name_key: String,
    pub interest_score: Option<i64>,
    pub lesson_feeling_score: Option<i64>,
    pub entries: Vec<EvidenceEntryInput>,
}

pub(super) fn validate_request(
    request: &SaveLessonEvidenceRequest,
    goal_count: usize,
) -> Result<Vec<ValidatedEvidenceGroup>, String> {
    if request.groups.len() != 3 {
        return Err("Keep exactly three teaching groups for this lesson.".to_owned());
    }
    let mut positions = std::collections::HashSet::new();
    let mut names = std::collections::HashSet::new();
    let mut validated = Vec::with_capacity(3);
    for group in &request.groups {
        if !positions.insert(group.position) || !(1..=3).contains(&group.position) {
            return Err("Each teaching group must have one position from 1 to 3.".to_owned());
        }
        let name = group.name.trim().to_owned();
        if name.is_empty() || name.chars().count() > 80 {
            return Err("Name every teaching group using 1 to 80 characters.".to_owned());
        }
        let name_key = name.to_lowercase();
        if !names.insert(name_key.clone()) {
            return Err("Give each teaching group a different name.".to_owned());
        }
        for score in [group.interest_score, group.lesson_feeling_score]
            .into_iter()
            .flatten()
        {
            if !(1..=5).contains(&score) {
                return Err("Overall lesson ratings must be between 1 and 5.".to_owned());
            }
        }
        let mut goal_numbers = std::collections::HashSet::new();
        for entry in &group.entries {
            if entry.learning_goal_number < 1
                || entry.learning_goal_number as usize > goal_count
                || !goal_numbers.insert(entry.learning_goal_number)
            {
                return Err("Each result must match one learning goal in this lesson.".to_owned());
            }
            match (entry.questions_correct, entry.questions_total) {
                (None, None) => {}
                (Some(correct), Some(total))
                    if (1..=1000).contains(&total) && (0..=total).contains(&correct) => {}
                _ => {
                    return Err(
                        "Record both correct and total. Correct cannot be greater than total."
                            .to_owned(),
                    )
                }
            }
            if entry
                .misunderstanding_note
                .as_deref()
                .is_some_and(|note| note.trim().chars().count() > 500)
            {
                return Err(
                    "Keep each misunderstanding note to 500 characters or fewer.".to_owned(),
                );
            }
            for score in [entry.confidence_score, entry.difficulty_score]
                .into_iter()
                .flatten()
            {
                if !(1..=5).contains(&score) {
                    return Err("Confidence and difficulty must be between 1 and 5.".to_owned());
                }
            }
        }
        validated.push(ValidatedEvidenceGroup {
            id: group.id.clone(),
            position: group.position,
            name,
            name_key,
            interest_score: group.interest_score,
            lesson_feeling_score: group.lesson_feeling_score,
            entries: group.entries.clone(),
        });
    }
    validated.sort_by_key(|group| group.position);
    if request.status == EvidenceStatus::Complete
        && validated.iter().any(|group| {
            group.entries.len() != goal_count
                || group
                    .entries
                    .iter()
                    .any(|entry| entry.questions_correct.is_none())
        })
    {
        return Err(
            "Record a correct and total score for every group and learning goal before finishing."
                .to_owned(),
        );
    }
    Ok(validated)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> SaveLessonEvidenceRequest {
        SaveLessonEvidenceRequest {
            context: LessonContextRequest {
                academic_session_id: "session".into(),
                academic_period_id: "period".into(),
                teaching_assignment_id: "assignment".into(),
            },
            lesson_id: "lesson".into(),
            lesson_version_id: "version".into(),
            expected_revision: None,
            status: EvidenceStatus::Draft,
            groups: ["Needs support", "Developing", "Secure"]
                .into_iter()
                .enumerate()
                .map(|(index, name)| EvidenceGroupInput {
                    id: None,
                    position: index as i64 + 1,
                    name: name.into(),
                    interest_score: None,
                    lesson_feeling_score: None,
                    entries: vec![],
                })
                .collect(),
        }
    }

    #[test]
    fn requires_exactly_three_unique_groups() {
        let mut value = request();
        value.groups[1].name = " needs SUPPORT ".into();
        assert_eq!(
            validate_request(&value, 2).unwrap_err(),
            "Give each teaching group a different name."
        );
    }

    #[test]
    fn rejects_incomplete_completion() {
        let mut value = request();
        value.status = EvidenceStatus::Complete;
        assert_eq!(
            validate_request(&value, 2).unwrap_err(),
            "Record a correct and total score for every group and learning goal before finishing."
        );
    }

    #[test]
    fn rejects_an_impossible_score() {
        let mut value = request();
        value.groups[0].entries.push(EvidenceEntryInput {
            learning_goal_number: 1,
            questions_correct: Some(4),
            questions_total: Some(3),
            misunderstanding_note: None,
            confidence_score: None,
            difficulty_score: None,
        });
        assert_eq!(
            validate_request(&value, 2).unwrap_err(),
            "Record both correct and total. Correct cannot be greater than total."
        );
    }
}
