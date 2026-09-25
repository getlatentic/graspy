use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::academic_workspace::repository::names_a_distinct_class;
use crate::db::Database;
use crate::lesson_planning::CLASSWORK_COMPLETE_SQL;

use super::domain::{
    NextLesson, NextTeachingSlot, SchoolBreak, SchoolDay, SearchFromNow, SetClassTimetableRequest,
    TeachingSlot, ValidatedTimetable, Weekday,
};

/// The slots one class is taught in, this term.
pub(super) fn slots_for_class(
    database: &Database,
    request: &SetClassTimetableRequest,
) -> Result<Vec<TeachingSlot>, String> {
    database.with_connection(|connection| {
        read_slots(
            connection,
            &request.teaching_assignment_id,
            &request.academic_period_id,
        )
    })
}

fn read_slots(
    connection: &Connection,
    assignment_id: &str,
    period_id: &str,
) -> Result<Vec<TeachingSlot>, String> {
    let mut statement = connection
        .prepare(
            "SELECT weekday, period_ordinal FROM teaching_slots
             WHERE teaching_assignment_id = ?1 AND academic_period_id = ?2
             ORDER BY weekday, period_ordinal",
        )
        .map_err(unreadable)?;
    let rows = statement
        .query_map(params![assignment_id, period_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(unreadable)?;
    rows.map(|row| {
        let (weekday, period) = row.map_err(unreadable)?;
        Ok(TeachingSlot {
            weekday: Weekday::from_number(weekday)?,
            period,
        })
    })
    .collect()
}

/// Replace this class's timetable with the one the teacher set.
///
/// Replacing rather than merging is what makes removing a period possible: the
/// screen sends the timetable it shows, and what is not in it is not taught.
pub(super) fn set_timetable(
    database: &Database,
    request: SetClassTimetableRequest,
) -> Result<Vec<TeachingSlot>, String> {
    let timetable = ValidatedTimetable::new(&request.slots)?;
    database.with_connection_mut(move |connection| -> Result<Vec<TeachingSlot>, String> {
        let transaction = connection.transaction().map_err(unwritable)?;
        require_class(&transaction, &request)?;
        transaction
            .execute(
                "DELETE FROM teaching_slots
                 WHERE teaching_assignment_id = ?1 AND academic_period_id = ?2",
                params![request.teaching_assignment_id, request.academic_period_id],
            )
            .map_err(unwritable)?;
        for slot in &timetable.slots {
            transaction
                .execute(
                    "INSERT INTO teaching_slots (
                         id, teaching_assignment_id, academic_period_id, weekday, period_ordinal
                     ) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        format!("slot-{}", Uuid::new_v4()),
                        request.teaching_assignment_id,
                        request.academic_period_id,
                        slot.weekday.number(),
                        slot.period,
                    ],
                )
                .map_err(period_already_taken)?;
        }
        transaction.commit().map_err(unwritable)?;
        read_slots(
            connection,
            &request.teaching_assignment_id,
            &request.academic_period_id,
        )
    })
}

fn require_class(
    connection: &Connection,
    request: &SetClassTimetableRequest,
) -> Result<(), String> {
    let known: bool = connection
        .query_row(
            "SELECT EXISTS(
                 SELECT 1 FROM teaching_assignments
                 WHERE id = ?1 AND academic_session_id = ?2 AND status = 'active'
             ) AND EXISTS(
                 SELECT 1 FROM academic_periods
                 WHERE id = ?3 AND academic_session_id = ?2
             )",
            params![
                request.teaching_assignment_id,
                request.academic_session_id,
                request.academic_period_id
            ],
            |row| row.get(0),
        )
        .map_err(unreadable)?;
    if known {
        return Ok(());
    }
    Err("That class is not part of the selected term.".to_owned())
}

/// The next period this teacher stands in front of a class, and what for.
///
/// Today comes from the database rather than from a screen, so the answer is
/// about the day being asked on. A whole day counts as still to come: graspy
/// holds no clock times, so it cannot know a period has been taught, and
/// naming this morning's class is better than skipping the day it falls on.
pub(super) fn next_slot(
    database: &Database,
    session_id: &str,
    period_id: &str,
) -> Result<Option<NextTeachingSlot>, String> {
    database.with_connection(|connection| -> Result<Option<NextTeachingSlot>, String> {
        let from = SearchFromNow {
            today: today(connection)?,
            from_period: 1,
        };
        for (offset, (weekday, from_period)) in from.days_ahead().into_iter().enumerate() {
            if let Some(slot) =
                read_next_on(connection, session_id, period_id, weekday, from_period)?
            {
                return Ok(Some(NextTeachingSlot {
                    is_today: offset == 0,
                    ..slot
                }));
            }
        }
        Ok(None)
    })
}

fn today(connection: &Connection) -> Result<Weekday, String> {
    let number: i64 = connection
        .query_row(
            "SELECT CAST(strftime('%w', 'now', 'localtime') AS INTEGER)",
            params![],
            |row| row.get(0),
        )
        .map_err(unreadable)?;
    Weekday::from_sqlite(number)
}

fn read_next_on(
    connection: &Connection,
    session_id: &str,
    period_id: &str,
    weekday: Weekday,
    from_period: i64,
) -> Result<Option<NextTeachingSlot>, String> {
    let found = connection
        .query_row(
            "SELECT teaching_slots.teaching_assignment_id, teaching_slots.period_ordinal,
                    grade_levels.display_name, teaching_assignments.class_section,
                    subjects.name
             FROM teaching_slots
             JOIN teaching_assignments
               ON teaching_assignments.id = teaching_slots.teaching_assignment_id
              AND teaching_assignments.status = 'active'
             JOIN grade_levels ON grade_levels.id = teaching_assignments.grade_level_id
             JOIN subjects ON subjects.id = teaching_assignments.subject_id
             WHERE teaching_slots.academic_period_id = ?1
               AND teaching_assignments.academic_session_id = ?2
               AND teaching_slots.weekday = ?3
               AND teaching_slots.period_ordinal >= ?4
             ORDER BY teaching_slots.period_ordinal
             LIMIT 1",
            params![period_id, session_id, weekday.number(), from_period],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(unreadable)?;
    let Some((assignment_id, period, grade_level, class_section, subject)) = found else {
        return Ok(None);
    };
    let (week_ordinal, lesson) = match current_week(connection, &assignment_id, period_id)? {
        Some((week_id, ordinal)) => (
            Some(ordinal),
            lesson_in_week(connection, &assignment_id, &week_id)?,
        ),
        None => (None, None),
    };
    Ok(Some(NextTeachingSlot {
        lesson,
        week_ordinal,
        class_name: class_name(&grade_level, class_section.as_deref()),
        subject,
        teaching_assignment_id: assignment_id,
        weekday,
        period,
        is_today: false,
    }))
}

/// The week of the term today falls in, when the term is still running.
fn current_week(
    connection: &Connection,
    assignment_id: &str,
    period_id: &str,
) -> Result<Option<(String, i64)>, String> {
    connection
        .query_row(
            "SELECT scheme_weeks.id, scheme_weeks.ordinal
             FROM scheme_weeks
             JOIN schemes_of_work ON schemes_of_work.id = scheme_weeks.scheme_id
             WHERE schemes_of_work.teaching_assignment_id = ?1
               AND schemes_of_work.academic_period_id = ?2
               AND scheme_weeks.starts_on <= date('now')
               AND scheme_weeks.ends_on >= date('now')
             ORDER BY scheme_weeks.ordinal
             LIMIT 1",
            params![assignment_id, period_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(unreadable)
}

fn lesson_in_week(
    connection: &Connection,
    assignment_id: &str,
    week_id: &str,
) -> Result<Option<NextLesson>, String> {
    connection
        .query_row(
            &format!(
                "SELECT lessons.id, lessons.topic, lessons.subtopic,
                        lessons.status = 'confirmed' AND {CLASSWORK_COMPLETE_SQL}
                 FROM lessons
                 LEFT JOIN scheme_entries week_of_entry
                        ON week_of_entry.id = lessons.scheme_entry_id
                 WHERE lessons.teaching_assignment_id = ?1
                   AND COALESCE(lessons.scheme_week_id, week_of_entry.scheme_week_id) = ?2
                 ORDER BY lessons.updated_at DESC
                 LIMIT 1"
            ),
            params![assignment_id, week_id],
            |row| {
                Ok(NextLesson {
                    lesson_id: row.get(0)?,
                    topic: row.get(1)?,
                    subtopic: row.get(2)?,
                    ready_to_teach: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(unreadable)
}

/// What a class is called, by the one rule that decides it.
///
/// A teacher with one class often names the section after the year, so "JSS 1"
/// with a section of "JSS1" is one class and not two — saying both reads
/// "JSS 1 JSS1", which is the same fact twice.
fn class_name(grade_level: &str, class_section: Option<&str>) -> String {
    match class_section.filter(|section| names_a_distinct_class(section, grade_level)) {
        Some(section) => format!("{grade_level} {section}"),
        None => grade_level.to_owned(),
    }
}

/// A period claimed by another class is the one failure a teacher can act on:
/// they are already teaching something else then.
fn period_already_taken(error: rusqlite::Error) -> String {
    let claimed = matches!(
        &error,
        rusqlite::Error::SqliteFailure(failure, Some(message))
            if failure.code == rusqlite::ErrorCode::ConstraintViolation
                && message.contains("teaching_slots")
    );
    if claimed {
        return "You already teach another class in that period. Free it there first.".to_owned();
    }
    unwritable(error)
}

fn unreadable(error: rusqlite::Error) -> String {
    let _diagnostic_source = error;
    "Your timetable could not be read. Close the app, reopen it, and try again.".to_owned()
}

fn unwritable(error: rusqlite::Error) -> String {
    let _diagnostic_source = error;
    "Your timetable could not be saved. Close the app, reopen it, and try again.".to_owned()
}

/// The school day as it was described, or nothing until a teacher describes it.
///
/// Nothing is invented here: a day the app has not been told about is absent,
/// and the screen that asks says which day it is standing in for.
pub(super) fn school_day(database: &Database) -> Result<Option<SchoolDay>, String> {
    database.with_connection(|connection| -> Result<Option<SchoolDay>, String> {
        connection
            .query_row(
                "SELECT starts_at, ends_at, period_minutes,
                        short_break_after_period, short_break_minutes,
                        long_break_after_period, long_break_minutes,
                        teaching_days
                 FROM school_day WHERE id = 1",
                params![],
                |row| {
                    Ok((
                        SchoolDay {
                            teaching_days: vec![],
                            starts_at: row.get(0)?,
                            ends_at: row.get(1)?,
                            period_minutes: row.get(2)?,
                            short_break: taken_break(row.get(3)?, row.get(4)?),
                            long_break: taken_break(row.get(5)?, row.get(6)?),
                        },
                        row.get::<_, String>(7)?,
                    ))
                },
            )
            .optional()
            .map_err(unreadable)?
            .map(|(day, teaching_days)| {
                Ok(SchoolDay {
                    teaching_days: weekdays_from_json(&teaching_days)?,
                    ..day
                })
            })
            .transpose()
    })
}

/// The column holds weekday numbers because they sort and read plainly in the
/// library; the contract holds their names. This is the one place that knows.
fn weekdays_from_json(stored: &str) -> Result<Vec<Weekday>, String> {
    serde_json::from_str::<Vec<i64>>(stored)
        .map_err(|_| "Your school week could not be read. Set it again.".to_owned())?
        .into_iter()
        .map(Weekday::from_number)
        .collect()
}

fn weekdays_to_json(days: &[Weekday]) -> Result<String, String> {
    serde_json::to_string(&days.iter().map(|day| day.number()).collect::<Vec<_>>())
        .map_err(|_| "Your school week could not be saved.".to_owned())
}

fn taken_break(after_period: Option<i64>, minutes: Option<i64>) -> Option<SchoolBreak> {
    after_period
        .zip(minutes)
        .map(|(after_period, minutes)| SchoolBreak {
            after_period,
            minutes,
        })
}

/// Describe the school day. One school, one day, so this replaces rather than adds.
pub(super) fn set_school_day(database: &Database, day: SchoolDay) -> Result<SchoolDay, String> {
    if let Some(fault) = day.fault() {
        return Err(fault);
    }
    database.with_connection_mut(move |connection| -> Result<SchoolDay, String> {
        connection
            .execute(
                "INSERT INTO school_day (
                     id, starts_at, ends_at, period_minutes,
                     short_break_after_period, short_break_minutes,
                     long_break_after_period, long_break_minutes, teaching_days
                 ) VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                     starts_at = excluded.starts_at,
                     ends_at = excluded.ends_at,
                     period_minutes = excluded.period_minutes,
                     short_break_after_period = excluded.short_break_after_period,
                     short_break_minutes = excluded.short_break_minutes,
                     long_break_after_period = excluded.long_break_after_period,
                     long_break_minutes = excluded.long_break_minutes,
                     teaching_days = excluded.teaching_days,
                     updated_at = CURRENT_TIMESTAMP",
                params![
                    day.starts_at,
                    day.ends_at,
                    day.period_minutes,
                    day.short_break.map(|taken| taken.after_period),
                    day.short_break.map(|taken| taken.minutes),
                    day.long_break.map(|taken| taken.after_period),
                    day.long_break.map(|taken| taken.minutes),
                    weekdays_to_json(&day.teaching_days)?,
                ],
            )
            .map_err(unwritable)?;
        Ok(day)
    })
}

/// The classes this teacher stands in front of today, in the order they come.
///
/// A class taught twice in a day is named once: the front screen lists classes,
/// not periods, and the period a teacher is heading to next is already said
/// above that list.
pub(super) fn todays_classes(
    database: &Database,
    session_id: &str,
    period_id: &str,
) -> Result<Vec<String>, String> {
    database.with_connection(|connection| -> Result<Vec<String>, String> {
        let today = today(connection)?;
        let mut statement = connection
            .prepare(
                "SELECT teaching_slots.teaching_assignment_id
                 FROM teaching_slots
                 JOIN teaching_assignments
                   ON teaching_assignments.id = teaching_slots.teaching_assignment_id
                  AND teaching_assignments.status = 'active'
                 WHERE teaching_slots.academic_period_id = ?1
                   AND teaching_assignments.academic_session_id = ?2
                   AND teaching_slots.weekday = ?3
                 ORDER BY teaching_slots.period_ordinal",
            )
            .map_err(unreadable)?;
        let rows = statement
            .query_map(params![period_id, session_id, today.number()], |row| {
                row.get::<_, String>(0)
            })
            .map_err(unreadable)?;
        let mut classes: Vec<String> = Vec::new();
        for row in rows {
            let id = row.map_err(unreadable)?;
            if !classes.contains(&id) {
                classes.push(id);
            }
        }
        Ok(classes)
    })
}
