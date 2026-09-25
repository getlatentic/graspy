//! What a timetable does once it is stored: which class it names, what it
//! refuses, and what a teacher is told they teach next.

use crate::academic_workspace::domain::{
    AcademicCalendarKind, CreateAcademicWorkspaceRequest, CreateTeachingAssignment,
};
use crate::academic_workspace::repository::create_workspace;
use crate::db::Database;

use super::domain::{SchoolBreak, SchoolDay, SetClassTimetableRequest, TeachingSlot, Weekday};
use super::repository::{
    next_slot, school_day, set_school_day, set_timetable, slots_for_class, todays_classes,
};

struct TestSchool {
    database: Database,
    session_id: String,
    period_id: String,
    mathematics_id: String,
    english_id: String,
}

fn setup() -> TestSchool {
    let database = Database::in_memory();
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
            assignments: vec![
                CreateTeachingAssignment {
                    subject: "Mathematics".to_owned(),
                    grade_level_id: "grade-jss-2".to_owned(),
                    class_section: Some("A".to_owned()),
                },
                CreateTeachingAssignment {
                    subject: "English Studies".to_owned(),
                    grade_level_id: "grade-jss-1".to_owned(),
                    class_section: Some("B".to_owned()),
                },
            ],
        },
    )
    .expect("academic workspace")
    .workspace
    .expect("configured workspace");
    let class = |subject: &str| {
        workspace
            .assignments
            .iter()
            .find(|assignment| assignment.subject == subject)
            .unwrap_or_else(|| panic!("a class for {subject}"))
            .id
            .clone()
    };
    TestSchool {
        session_id: workspace.active_session_id.clone(),
        period_id: workspace.active_period_id.clone(),
        mathematics_id: class("Mathematics"),
        english_id: class("English Studies"),
        database,
    }
}

fn timetable(
    school: &TestSchool,
    class_id: &str,
    slots: Vec<TeachingSlot>,
) -> SetClassTimetableRequest {
    SetClassTimetableRequest {
        academic_session_id: school.session_id.clone(),
        academic_period_id: school.period_id.clone(),
        teaching_assignment_id: class_id.to_owned(),
        slots,
    }
}

fn slot(weekday: Weekday, period: i64) -> TeachingSlot {
    TeachingSlot { weekday, period }
}

#[test]
fn a_class_keeps_the_periods_a_teacher_set_and_reads_them_back_in_week_order() {
    let school = setup();
    let request = timetable(
        &school,
        &school.mathematics_id,
        vec![
            slot(Weekday::Thursday, 1),
            slot(Weekday::Monday, 3),
            slot(Weekday::Monday, 1),
        ],
    );

    let saved = set_timetable(&school.database, request.clone()).expect("a saved timetable");

    assert_eq!(
        saved,
        vec![
            slot(Weekday::Monday, 1),
            slot(Weekday::Monday, 3),
            slot(Weekday::Thursday, 1),
        ]
    );
    assert_eq!(
        slots_for_class(&school.database, &request).expect("the timetable again"),
        saved
    );
}

/// The screen sends the timetable it shows, so a period taken off it is a
/// period no longer taught. Merging would leave it there for ever.
#[test]
fn setting_a_timetable_replaces_the_one_before_it() {
    let school = setup();
    set_timetable(
        &school.database,
        timetable(
            &school,
            &school.mathematics_id,
            vec![slot(Weekday::Monday, 1), slot(Weekday::Friday, 4)],
        ),
    )
    .expect("the first timetable");

    let saved = set_timetable(
        &school.database,
        timetable(
            &school,
            &school.mathematics_id,
            vec![slot(Weekday::Monday, 1)],
        ),
    )
    .expect("the second timetable");

    assert_eq!(saved, vec![slot(Weekday::Monday, 1)]);
}

/// One teacher, one room, one period. The app is a single teacher's, so a
/// period already claimed by another class is a mistake it can name.
#[test]
fn a_period_already_taught_by_another_class_is_refused_with_what_to_do() {
    let school = setup();
    set_timetable(
        &school.database,
        timetable(
            &school,
            &school.mathematics_id,
            vec![slot(Weekday::Monday, 3)],
        ),
    )
    .expect("mathematics on Monday");

    let error = set_timetable(
        &school.database,
        timetable(&school, &school.english_id, vec![slot(Weekday::Monday, 3)]),
    )
    .expect_err("two classes in one period");

    assert!(
        error.contains("already teach another class"),
        "unexpected: {error}"
    );
}

#[test]
fn a_class_outside_the_selected_term_is_refused() {
    let school = setup();
    let mut request = timetable(
        &school,
        &school.mathematics_id,
        vec![slot(Weekday::Monday, 1)],
    );
    request.teaching_assignment_id = "class-that-does-not-exist".to_owned();

    let error = set_timetable(&school.database, request).expect_err("an unknown class");

    assert!(
        error.contains("not part of the selected term"),
        "unexpected: {error}"
    );
}

/// Nothing is invented: a teacher who has not set a timetable is told nothing
/// rather than told a guess.
#[test]
fn nothing_is_next_until_a_timetable_says_so() {
    let school = setup();

    let next = next_slot(&school.database, &school.session_id, &school.period_id)
        .expect("a search with no timetable");

    assert_eq!(next, None);
}

/// A whole week of slots is searched from today, so whichever day the test runs
/// on there is one to find, and it is one of the two that were set.
#[test]
fn the_next_period_is_found_whatever_day_it_is_asked_on() {
    let school = setup();
    set_timetable(
        &school.database,
        timetable(
            &school,
            &school.mathematics_id,
            vec![slot(Weekday::Tuesday, 2)],
        ),
    )
    .expect("mathematics on Tuesday");
    set_timetable(
        &school.database,
        timetable(&school, &school.english_id, vec![slot(Weekday::Friday, 5)]),
    )
    .expect("english on Friday");

    let next = next_slot(&school.database, &school.session_id, &school.period_id)
        .expect("a search")
        .expect("a class to teach next");

    assert!(
        (next.weekday == Weekday::Tuesday && next.period == 2)
            || (next.weekday == Weekday::Friday && next.period == 5),
        "unexpected slot: {next:?}"
    );
    if next.weekday == Weekday::Tuesday {
        assert_eq!(next.class_name, "JSS 2 A");
        assert_eq!(next.subject, "Mathematics");
    } else {
        assert_eq!(next.class_name, "JSS 1 B");
        assert_eq!(next.subject, "English Studies");
    }
    // No term plan has been adopted, so there is no week and no lesson to name.
    assert_eq!(next.week_ordinal, None);
    assert_eq!(next.lesson, None);
}

#[test]
fn a_school_day_is_absent_until_a_teacher_describes_it() {
    let school = setup();

    assert_eq!(school_day(&school.database).expect("a search"), None);
}

#[test]
fn the_school_day_a_teacher_described_survives_being_described_again() {
    let school = setup();
    let day = SchoolDay {
        teaching_days: vec![
            Weekday::Monday,
            Weekday::Tuesday,
            Weekday::Wednesday,
            Weekday::Thursday,
            Weekday::Friday,
        ],
        starts_at: "08:00".to_owned(),
        ends_at: "14:00".to_owned(),
        period_minutes: 40,
        short_break: Some(SchoolBreak {
            after_period: 2,
            minutes: 15,
        }),
        long_break: Some(SchoolBreak {
            after_period: 5,
            minutes: 30,
        }),
    };

    set_school_day(&school.database, day.clone()).expect("a described day");
    let shorter = SchoolDay {
        period_minutes: 60,
        long_break: None,
        ..day
    };
    set_school_day(&school.database, shorter.clone()).expect("a re-described day");

    assert_eq!(
        school_day(&school.database).expect("the day back"),
        Some(shorter)
    );
}

/// The library refuses the same things, but a constraint violation is not a
/// sentence a teacher can act on.
#[test]
fn a_day_that_cannot_be_taught_is_refused_in_the_teachers_terms() {
    let school = setup();
    let day = SchoolDay {
        teaching_days: vec![
            Weekday::Monday,
            Weekday::Tuesday,
            Weekday::Wednesday,
            Weekday::Thursday,
            Weekday::Friday,
        ],
        starts_at: "14:00".to_owned(),
        ends_at: "08:00".to_owned(),
        period_minutes: 40,
        short_break: None,
        long_break: None,
    };

    let error =
        set_school_day(&school.database, day).expect_err("a day that closes before it opens");

    assert!(
        error.contains("close after it opens"),
        "unexpected: {error}"
    );
}

/// The week a school keeps is its own: Saturday has always been storable
/// against a slot, and now it can be said.
#[test]
fn a_school_that_teaches_on_a_saturday_can_say_so() {
    let school = setup();
    let saturday_school = SchoolDay {
        teaching_days: vec![
            Weekday::Monday,
            Weekday::Tuesday,
            Weekday::Wednesday,
            Weekday::Thursday,
            Weekday::Friday,
            Weekday::Saturday,
        ],
        starts_at: "08:00".to_owned(),
        ends_at: "14:00".to_owned(),
        period_minutes: 40,
        short_break: None,
        long_break: None,
    };

    set_school_day(&school.database, saturday_school.clone()).expect("a six-day week");

    assert_eq!(
        school_day(&school.database)
            .expect("the week back")
            .expect("a described day")
            .teaching_days,
        vec![
            Weekday::Monday,
            Weekday::Tuesday,
            Weekday::Wednesday,
            Weekday::Thursday,
            Weekday::Friday,
            Weekday::Saturday,
        ]
    );
}

#[test]
fn a_week_with_no_teaching_day_is_refused() {
    let school = setup();
    let closed = SchoolDay {
        teaching_days: vec![],
        starts_at: "08:00".to_owned(),
        ends_at: "14:00".to_owned(),
        period_minutes: 40,
        short_break: None,
        long_break: None,
    };

    let error = set_school_day(&school.database, closed).expect_err("a week with no days");

    assert!(error.contains("at least one day"), "unexpected: {error}");
}

/// The screen parses this against its own schema, so the two have to agree on
/// the words. They did not: the week went over as numbers while every other day
/// on the contract goes over by name, and the screen answered "your school day
/// could not be read" — which no test on either side could see.
#[test]
fn the_school_day_crosses_the_boundary_in_the_words_the_screen_reads() {
    let day = SchoolDay {
        teaching_days: vec![Weekday::Monday, Weekday::Saturday],
        starts_at: "08:00".to_owned(),
        ends_at: "14:00".to_owned(),
        period_minutes: 40,
        short_break: Some(SchoolBreak {
            after_period: 2,
            minutes: 15,
        }),
        long_break: None,
    };

    let sent = serde_json::to_value(&day).expect("a school day on the wire");

    assert_eq!(
        sent,
        serde_json::json!({
            "teachingDays": ["monday", "saturday"],
            "startsAt": "08:00",
            "endsAt": "14:00",
            "periodMinutes": 40,
            "shortBreak": { "afterPeriod": 2, "minutes": 15 },
            "longBreak": null,
        })
    );
}

/// The front screen lists classes, not periods, so a class taught twice in a
/// day is named once — and the order is the order the day runs. Every weekday
/// carries the same shape, so the answer holds whichever day this runs on.
#[test]
fn today_names_each_class_once_in_the_order_it_is_taught() {
    let school = setup();
    let every_day = |period| {
        (1..=7)
            .map(|number| slot(Weekday::from_number(number).expect("a weekday"), period))
            .collect::<Vec<_>>()
    };
    let mut mathematics = every_day(5);
    mathematics.extend(every_day(1));
    set_timetable(
        &school.database,
        timetable(&school, &school.mathematics_id, mathematics),
    )
    .expect("mathematics twice a day");
    set_timetable(
        &school.database,
        timetable(&school, &school.english_id, every_day(3)),
    )
    .expect("english once a day");

    let today = todays_classes(&school.database, &school.session_id, &school.period_id)
        .expect("today's classes");

    assert_eq!(
        today,
        vec![school.mathematics_id.clone(), school.english_id.clone()]
    );
}
