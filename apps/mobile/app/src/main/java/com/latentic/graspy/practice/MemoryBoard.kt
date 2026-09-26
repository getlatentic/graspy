package com.latentic.graspy.practice

/** How the learner's last try went on one thing they are memorising. */
enum class ItemState { NOT_YET, SAID, WRONG, UNSURE }

/** One thing to say from memory, and how the last try went. */
data class BoardItem(val label: String, val state: ItemState)

/**
 * The things this step asks the learner to say, in the order they are said. The board is both the
 * thing being memorised and the record of how it went, so a result needs no panel of its own.
 */
fun boardItems(exercise: PracticeExercise, move: LessonMove?, outcome: PracticeOutcome?): List<BoardItem> =
    when (exercise) {
        is PracticeExercise.TimesTableRecitation -> tableItems(exercise, outcome?.recitation)
        is PracticeExercise.FactAnswer -> listOf(
            BoardItem("${exercise.table} × ${exercise.multiplier}", answerState(outcome)),
        )
        is PracticeExercise.Planned -> sequenceItems(move, outcome?.sequence)
        else -> emptyList()
    }

private fun tableItems(exercise: PracticeExercise.TimesTableRecitation, result: RecitationResult?): List<BoardItem> =
    exercise.multipliers.map { multiplier ->
        BoardItem(
            label = "${exercise.table} × $multiplier",
            state = when {
                result == null -> ItemState.NOT_YET
                multiplier in result.correctMultipliers -> ItemState.SAID
                result.incorrectFacts.any { it.multiplier == multiplier } -> ItemState.WRONG
                multiplier in result.uncertainMultipliers -> ItemState.UNSURE
                else -> ItemState.NOT_YET
            },
        )
    }

private fun sequenceItems(move: LessonMove?, result: SequenceResult?): List<BoardItem> =
    move?.activity?.items.orEmpty().map { item ->
        BoardItem(
            label = item.spoken,
            state = when {
                result == null -> ItemState.NOT_YET
                item.id in result.outOfOrder -> ItemState.WRONG
                item.id in result.said -> ItemState.SAID
                else -> ItemState.NOT_YET
            },
        )
    }

private fun answerState(outcome: PracticeOutcome?): ItemState = when (outcome?.decision) {
    null -> ItemState.NOT_YET
    PracticeDecision.CORRECT -> ItemState.SAID
    PracticeDecision.TRY_AGAIN -> ItemState.WRONG
    else -> ItemState.UNSURE
}
