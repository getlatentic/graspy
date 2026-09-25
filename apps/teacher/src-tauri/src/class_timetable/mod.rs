//! When a class is taught: the weekday and period each of a teacher's classes
//! occupies, and what that means for what they teach next.

pub(crate) mod commands;
pub mod domain;
mod repository;
#[cfg(test)]
mod tests;

pub use commands::{
    get_class_timetable, get_next_teaching_slot, get_school_day, get_todays_classes,
    set_class_timetable, set_school_day,
};
