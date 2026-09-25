use rusqlite::params;

use crate::db::Database;

use super::snapshot::load_snapshot;
use super::{resolve_context, RepositoryError, RepositoryResult};
use crate::lesson_planning::domain::{DiscardLessonRequest, LessonWorkspaceSnapshot};

/// Remove a lesson a teacher has decided not to teach.
///
/// A teacher who starts a lesson and changes their mind has to be able to clear
/// it, or the list fills with starts that were never going to become anything
/// and they cannot tell what they still owe the class.
///
/// What goes with it is the lesson's own working material — its plan, steps,
/// learning goals, preparation, notes and anything typed into it. What holds it
/// back is work that has left the lesson: a confirmed version a head of
/// department may have signed, and the classwork, exit tests and group versions
/// built on top of one. Those are checked here so the teacher is told which of
/// them it is, in the order they would meet them.
pub(in crate::lesson_planning) fn discard_lesson(
    database: &Database,
    request: DiscardLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        refuse_if_the_lesson_has_left_the_draft(&transaction, &request.lesson_id)?;

        let discarded = transaction.execute(
            "DELETE FROM lessons
             WHERE id = ?1 AND academic_period_id = ?2 AND teaching_assignment_id = ?3",
            params![request.lesson_id, context.period_id, context.assignment_id],
        )?;
        if discarded == 0 {
            return Err(RepositoryError::NotFound(
                "That lesson is not available in the selected class and term.".to_owned(),
            ));
        }
        transaction.commit()?;
        load_snapshot(connection, &context, None)
    })
}

/// The finished work that keeps a lesson, each named so the teacher knows what
/// they would be throwing away and can go and deal with it.
const KEEPS_A_LESSON: &[(&str, &str)] = &[
    (
        "SELECT EXISTS (SELECT 1 FROM lesson_versions WHERE lesson_id = ?1)",
        "This lesson has been confirmed, so it stays. Edit it if the plan should change.",
    ),
    (
        "SELECT EXISTS (SELECT 1 FROM classwork_runs WHERE lesson_id = ?1)",
        "This lesson has classwork, so it stays. Remove the classwork first if you no longer want the lesson.",
    ),
    (
        "SELECT EXISTS (SELECT 1 FROM differentiated_classwork_runs WHERE lesson_id = ?1)",
        "This lesson has classwork for reading groups, so it stays. Remove that first if you no longer want the lesson.",
    ),
    (
        "SELECT EXISTS (SELECT 1 FROM lesson_evidence_sets WHERE lesson_id = ?1)",
        "This lesson has exit-test results recorded against it, so it stays.",
    ),
];

fn refuse_if_the_lesson_has_left_the_draft(
    transaction: &rusqlite::Transaction<'_>,
    lesson_id: &str,
) -> RepositoryResult<()> {
    for (holds_it, say_so) in KEEPS_A_LESSON {
        let held: bool = transaction.query_row(holds_it, [lesson_id], |row| row.get(0))?;
        if held {
            return Err(RepositoryError::Conflict((*say_so).to_owned()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lesson_planning::domain::{ConfirmGranularLessonRequest, SaveGranularLessonRequest};
    use crate::lesson_planning::repository::test_support::{setup, structured_request};
    use crate::lesson_planning::repository::{confirm_granular_lesson, save_draft};

    /// The whole point: a start a teacher walked away from leaves the list.
    #[test]
    fn a_lesson_a_teacher_walked_away_from_leaves_the_list() {
        let context = setup();
        let abandoned = save_draft(&context.database, structured_request(&context))
            .expect("a start")
            .selected_lesson
            .expect("lesson")
            .id;

        let left = discard_lesson(
            &context.database,
            DiscardLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: abandoned.clone(),
            },
        )
        .expect("the discard")
        .lessons;

        assert!(
            !left.iter().any(|lesson| lesson.id == abandoned),
            "the discarded lesson is still listed: {left:?}"
        );
    }

    /// A lesson with the plan written into it goes whole, because the plan is
    /// the lesson's own working material rather than something built on it.
    #[test]
    fn the_plan_written_into_a_lesson_goes_with_it() {
        let context = setup();
        let lesson_id = save_draft(&context.database, structured_request(&context))
            .expect("a start")
            .selected_lesson
            .expect("lesson")
            .id;
        let mut record = crate::lesson_planning::granular::tests::granular_record();
        record.program_snapshot.program_run_id = None;
        crate::lesson_planning::repository::save_granular_lesson(
            &context.database,
            SaveGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
                record,
            },
        )
        .expect("a plan");

        discard_lesson(
            &context.database,
            DiscardLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
            },
        )
        .expect("the discard");

        let orphaned: i64 = context
            .database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT COUNT(*) FROM lesson_granular_drafts WHERE lesson_id = ?1",
                    [&lesson_id],
                    |row| row.get(0),
                )
            })
            .expect("the count");
        assert_eq!(
            orphaned, 0,
            "the plan outlived the lesson it was written for"
        );
    }

    /// A confirmed lesson is a document a school may already have signed, so it
    /// is kept and the teacher is told why.
    #[test]
    fn a_confirmed_lesson_stays_and_says_why() {
        let context = setup();
        let lesson_id = save_draft(&context.database, structured_request(&context))
            .expect("a start")
            .selected_lesson
            .expect("lesson")
            .id;
        let mut record = crate::lesson_planning::granular::tests::granular_record();
        record.program_snapshot.program_run_id = None;
        crate::lesson_planning::repository::save_granular_lesson(
            &context.database,
            SaveGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
                record,
            },
        )
        .expect("a plan");
        confirm_granular_lesson(
            &context.database,
            ConfirmGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
            },
        )
        .expect("a confirmed lesson");

        let refusal = discard_lesson(
            &context.database,
            DiscardLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
            },
        )
        .expect_err("a refusal");

        assert!(
            refusal.contains("has been confirmed"),
            "unexpected refusal: {refusal}"
        );
    }

    /// Discarding reaches only the class and term the teacher is looking at, the
    /// same boundary every other write on a lesson holds.
    #[test]
    fn a_lesson_in_another_class_is_not_reachable() {
        let context = setup();
        let lesson_id = save_draft(&context.database, structured_request(&context))
            .expect("a start")
            .selected_lesson
            .expect("lesson")
            .id;
        let elsewhere = crate::lesson_planning::domain::LessonContextRequest {
            academic_session_id: context.lesson_context.academic_session_id.clone(),
            academic_period_id: context.lesson_context.academic_period_id.clone(),
            teaching_assignment_id: "assignment-that-is-not-theirs".to_owned(),
        };

        discard_lesson(
            &context.database,
            DiscardLessonRequest {
                context: elsewhere,
                lesson_id,
            },
        )
        .expect_err("another class");
    }
}
