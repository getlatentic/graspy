use serde::{Deserialize, Serialize};

/// A day of the school week, as a teacher names it.
///
/// Numbered from Monday because that is how a timetable is read and how the
/// next slot after today is found. Saturday and Sunday exist because some
/// schools teach on a Saturday, and refusing to record one would make the app
/// wrong about a real timetable rather than opinionated about a good one.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, schemars::JsonSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

impl Weekday {
    pub fn number(self) -> i64 {
        match self {
            Self::Monday => 1,
            Self::Tuesday => 2,
            Self::Wednesday => 3,
            Self::Thursday => 4,
            Self::Friday => 5,
            Self::Saturday => 6,
            Self::Sunday => 7,
        }
    }

    pub fn from_number(value: i64) -> Result<Self, String> {
        match value {
            1 => Ok(Self::Monday),
            2 => Ok(Self::Tuesday),
            3 => Ok(Self::Wednesday),
            4 => Ok(Self::Thursday),
            5 => Ok(Self::Friday),
            6 => Ok(Self::Saturday),
            7 => Ok(Self::Sunday),
            _ => Err("The saved timetable day is not a day of the week.".to_owned()),
        }
    }

    /// SQLite counts the week from Sunday as zero; a timetable counts it from
    /// Monday as one.
    pub fn from_sqlite(value: i64) -> Result<Self, String> {
        Self::from_number(if value == 0 { 7 } else { value })
    }
}

/// One period of one day on which a class is taught.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TeachingSlot {
    pub weekday: Weekday,
    pub period: i64,
}

/// The highest period number a school day is allowed to reach.
///
/// Twelve is past the end of any real school day and is a guard against a typo
/// becoming a timetable, not a claim about how a day is divided.
const HIGHEST_PERIOD: i64 = 12;

/// The slots a class is taught in, for one term, as the teacher set them.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetClassTimetableRequest {
    pub academic_session_id: String,
    pub academic_period_id: String,
    pub teaching_assignment_id: String,
    pub slots: Vec<TeachingSlot>,
}

/// A timetable checked before it is stored: no repeats, no impossible periods.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedTimetable {
    pub slots: Vec<TeachingSlot>,
}

impl ValidatedTimetable {
    pub fn new(slots: &[TeachingSlot]) -> Result<Self, String> {
        for slot in slots {
            if slot.period < 1 || slot.period > HIGHEST_PERIOD {
                return Err(format!("A period must be between 1 and {HIGHEST_PERIOD}."));
            }
        }
        let mut ordered = slots.to_vec();
        ordered.sort_by_key(|slot| (slot.weekday, slot.period));
        if ordered.windows(2).any(|pair| pair[0] == pair[1]) {
            return Err("This class is already taught in that period.".to_owned());
        }
        Ok(Self { slots: ordered })
    }
}

/// What a teacher teaches next, and what they will be teaching in it.
///
/// The lesson is whatever the week's plan holds, because a week's plan is
/// taught across that week's periods — so the answer is found through the class
/// rather than recorded a second time against the slot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NextTeachingSlot {
    pub teaching_assignment_id: String,
    pub class_name: String,
    pub subject: String,
    pub weekday: Weekday,
    pub period: i64,
    /// True when the slot falls on the day this was asked, rather than later.
    pub is_today: bool,
    pub week_ordinal: Option<i64>,
    pub lesson: Option<NextLesson>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NextLesson {
    pub lesson_id: String,
    pub topic: String,
    pub subtopic: Option<String>,
    /// Whether the lesson is confirmed and its classwork written.
    pub ready_to_teach: bool,
}

/// How far ahead a slot has to be to count as the next one.
///
/// A timetable repeats every week, so the search runs over the seven days from
/// today. A slot earlier today has been taught; the next one is later today or
/// on a later day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchFromNow {
    pub today: Weekday,
    /// Slots at or after this period count as still to come today.
    pub from_period: i64,
}

impl SearchFromNow {
    /// The seven days to look through, today first, in the order they come.
    pub fn days_ahead(self) -> [(Weekday, i64); 7] {
        let mut days = [(self.today, self.from_period); 7];
        for (offset, day) in days.iter_mut().enumerate() {
            let number = (self.today.number() - 1 + offset as i64) % 7 + 1;
            *day = (
                Weekday::from_number(number).expect("a weekday one week ahead"),
                if offset == 0 { self.from_period } else { 1 },
            );
        }
        days
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_timetable_reads_in_the_order_a_week_is_taught() {
        let timetable = ValidatedTimetable::new(&[
            TeachingSlot {
                weekday: Weekday::Wednesday,
                period: 2,
            },
            TeachingSlot {
                weekday: Weekday::Monday,
                period: 5,
            },
            TeachingSlot {
                weekday: Weekday::Monday,
                period: 1,
            },
        ])
        .expect("a timetable");

        assert_eq!(
            timetable.slots,
            vec![
                TeachingSlot {
                    weekday: Weekday::Monday,
                    period: 1
                },
                TeachingSlot {
                    weekday: Weekday::Monday,
                    period: 5
                },
                TeachingSlot {
                    weekday: Weekday::Wednesday,
                    period: 2
                },
            ]
        );
    }

    #[test]
    fn a_class_cannot_be_taught_twice_in_one_period() {
        let error = ValidatedTimetable::new(&[
            TeachingSlot {
                weekday: Weekday::Monday,
                period: 3,
            },
            TeachingSlot {
                weekday: Weekday::Monday,
                period: 3,
            },
        ])
        .expect_err("a repeated period");

        assert!(error.contains("already taught"), "unexpected: {error}");
    }

    #[test]
    fn a_period_outside_a_school_day_is_refused() {
        for period in [0, 13] {
            ValidatedTimetable::new(&[TeachingSlot {
                weekday: Weekday::Monday,
                period,
            }])
            .expect_err("a period outside a school day");
        }
    }

    /// The week wraps: asked on a Saturday, the days ahead run to the Saturday
    /// after it, so a Monday class is found rather than missed.
    #[test]
    fn the_days_ahead_wrap_through_the_week_and_start_at_today() {
        let days = SearchFromNow {
            today: Weekday::Saturday,
            from_period: 4,
        }
        .days_ahead();

        assert_eq!(days[0], (Weekday::Saturday, 4));
        assert_eq!(days[1], (Weekday::Sunday, 1));
        assert_eq!(days[2], (Weekday::Monday, 1));
        assert_eq!(days[6], (Weekday::Friday, 1));
    }
}

/// The shape of the school day, as a school states it.
///
/// The periods are never stored: they are worked out from this, so a bell that
/// moves moves them all. The arithmetic lives with the screens that read it
/// (`schoolDay.ts`); what is kept here is the description it reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchoolBreak {
    /// The break comes after this many periods have been taught.
    pub after_period: i64,
    pub minutes: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SchoolDay {
    /// The days this school teaches on, named the way every other day on the
    /// contract is named. Numbers are the column's business, not the screen's.
    pub teaching_days: Vec<Weekday>,
    pub starts_at: String,
    pub ends_at: String,
    pub period_minutes: i64,
    pub short_break: Option<SchoolBreak>,
    pub long_break: Option<SchoolBreak>,
}

impl SchoolDay {
    /// What is wrong with a described day, before it reaches the library.
    ///
    /// The table refuses the same things; saying them here is what turns a
    /// constraint violation into a sentence naming the field to change.
    pub fn fault(&self) -> Option<String> {
        if self.teaching_days.is_empty() {
            return Some("A school teaches on at least one day of the week.".to_owned());
        }
        let mut days = self.teaching_days.clone();
        days.sort_unstable();
        days.dedup();
        if days.len() != self.teaching_days.len() {
            return Some("A teaching day is named once.".to_owned());
        }
        if !is_clock_time(&self.starts_at) || !is_clock_time(&self.ends_at) {
            return Some("A school day opens and closes at a time of day.".to_owned());
        }
        if self.ends_at <= self.starts_at {
            return Some("The school day must close after it opens.".to_owned());
        }
        if !matches!(self.period_minutes, 40 | 45 | 60) {
            return Some("A period runs for 40, 45 or 60 minutes.".to_owned());
        }
        for taken in [self.short_break, self.long_break].into_iter().flatten() {
            if taken.after_period < 1 || !(5..=120).contains(&taken.minutes) {
                return Some("A break runs for between 5 and 120 minutes.".to_owned());
            }
        }
        if let (Some(short), Some(long)) = (self.short_break, self.long_break) {
            if short.after_period == long.after_period {
                return Some("The two breaks cannot both come after the same period.".to_owned());
            }
        }
        None
    }
}

/// "HH:MM" on a 24-hour clock, which is what the column stores.
fn is_clock_time(value: &str) -> bool {
    let mut parts = value.split(':');
    let (Some(hours), Some(minutes), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    matches!((hours.parse::<u32>(), minutes.parse::<u32>()), (Ok(h), Ok(m)) if h < 24 && m < 60)
        && hours.len() == 2
        && minutes.len() == 2
}
