package com.latentic.graspy.practice

import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.LessonCopy
import com.latentic.graspy.localization.fillWith

private fun LessonCopy.fact(exercise: PracticeExercise.FactAnswer, template: String): String = template.fillWith(
    number(exercise.table),
    number(exercise.multiplier),
    number(exercise.expected),
)

/**
 * The teacher's spoken result for a turn.
 *
 * The teacher composes what it says about this child's answer and the server sends those words, so
 * they are what the child reads and hears. The stored sentences remain for a turn that reaches the
 * screen without having been marked, which is the only case the teacher has not spoken for.
 */
internal fun feedbackText(copy: AppCopy, turn: LessonTurn, decision: PracticeDecision): String {
    turn.outcome?.feedback?.takeIf { it.isNotBlank() }?.let { return it }
    val lesson = copy.lesson.forTable(turn.table)
    return when (val exercise = turn.exercise) {
        is PracticeExercise.FactAnswer -> when (decision) {
            PracticeDecision.CORRECT -> lesson.correctShort
            PracticeDecision.TRY_AGAIN -> lesson.fact(exercise, lesson.learnFact)
            PracticeDecision.NOT_UNDERSTOOD -> copy.notUnderstoodFeedback
        }
        is PracticeExercise.TimesTableRecitation -> when (decision) {
            PracticeDecision.CORRECT -> lesson.correctShort
            PracticeDecision.TRY_AGAIN -> lesson.tryAgain
            PracticeDecision.NOT_UNDERSTOOD -> lesson.notUnderstoodFeedback
        }
        else -> when (decision) {
            PracticeDecision.CORRECT -> lesson.correctShort
            PracticeDecision.TRY_AGAIN -> lesson.tryAgain
            PracticeDecision.NOT_UNDERSTOOD -> copy.notUnderstoodFeedback
        }
    }
}
