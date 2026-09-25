use tauri::State;

use crate::db::Database;

use super::domain::{NextTeachingSlot, SchoolDay, SetClassTimetableRequest, TeachingSlot};
use super::repository;

#[tauri::command(async)]
pub fn get_class_timetable(
    database: State<'_, Database>,
    request: SetClassTimetableRequest,
) -> Result<Vec<TeachingSlot>, String> {
    repository::slots_for_class(&database, &request)
}

#[tauri::command(async)]
pub fn set_class_timetable(
    database: State<'_, Database>,
    request: SetClassTimetableRequest,
) -> Result<Vec<TeachingSlot>, String> {
    repository::set_timetable(&database, request)
}

/// What the teacher teaches next, from the day they are asking on.
#[tauri::command(async)]
pub fn get_next_teaching_slot(
    database: State<'_, Database>,
    academic_session_id: String,
    academic_period_id: String,
) -> Result<Option<NextTeachingSlot>, String> {
    repository::next_slot(&database, &academic_session_id, &academic_period_id)
}

/// The school day the periods are worked out from, or nothing until a teacher
/// has described theirs.
#[tauri::command(async)]
pub fn get_school_day(database: State<'_, Database>) -> Result<Option<SchoolDay>, String> {
    repository::school_day(&database)
}

#[tauri::command(async)]
pub fn set_school_day(database: State<'_, Database>, day: SchoolDay) -> Result<SchoolDay, String> {
    repository::set_school_day(&database, day)
}

/// The classes today holds, so the front screen can be about today.
#[tauri::command(async)]
pub fn get_todays_classes(
    database: State<'_, Database>,
    academic_session_id: String,
    academic_period_id: String,
) -> Result<Vec<String>, String> {
    repository::todays_classes(&database, &academic_session_id, &academic_period_id)
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<Vec<TeachingSlot>>("get_class_timetable");
    answers.of::<Option<NextTeachingSlot>>("get_next_teaching_slot");
    answers.of::<Option<SchoolDay>>("get_school_day");
    answers.of::<Vec<String>>("get_todays_classes");
    answers.of::<Vec<TeachingSlot>>("set_class_timetable");
    answers.of::<SchoolDay>("set_school_day");
}
