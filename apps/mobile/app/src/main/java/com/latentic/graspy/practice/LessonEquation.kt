package com.latentic.graspy.practice

/**
 * The fact a lesson is about, written the way a teacher writes it on the board: 1 × 4 = ?.
 *
 * The digits and the sign are what a child is learning to read and recall. Counting squares to reach
 * a product they are meant to know is a different, slower skill, so the screen shows the fact itself.
 * The product appears only once the child has said it correctly: a board that shows the answer while
 * the child is asked for it gives it away, even straight after it was taught.
 * Nothing is authored: the numbers come from the exercise the learner was given.
 */
fun equationFor(exercise: PracticeExercise?, answeredCorrectly: Boolean): String? = when (exercise) {
    is PracticeExercise.FactAnswer ->
        equation(exercise.table, exercise.multiplier, exercise.expected.takeIf { answeredCorrectly })
    is PracticeExercise.SevenTimesEight -> equation(7, 8, 56.takeIf { answeredCorrectly })
    else -> null
}

private fun equation(left: Int, right: Int, product: Int?): String = "$left × $right = ${product ?: "?"}"
