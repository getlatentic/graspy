package com.latentic.graspy.practice

import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.sync.MoveOrigin

enum class ClassroomStep { LOADING, LOAD_FAILED, LEARN, TOGETHER, YOUR_TURN, QUICK_CHECK, SUBMITTING, RESULT, REST }

data class ClassroomState(
    val key: String = "",
    val move: LessonMove? = null,
    val step: ClassroomStep = ClassroomStep.LOADING,
    val started: Boolean = false,
    val audioHeard: Boolean = false,
    val turn: LessonTurn? = null,
    val origin: MoveOrigin = MoveOrigin.CACHED,
    /** The last ask for a newer step ended without one, so a step kept on the phone will not become answerable by itself. */
    val refreshFailed: Boolean = false,
) {
    /** The Worker credits progress to the step it issued, so only an issued step may be answered. */
    val allowsAnswer: Boolean
        get() = ready && step in ANSWER_STEPS && origin == MoveOrigin.ISSUED

    /** A result is the learner's own; moving past a taught step tells the Worker, so it must be issued. */
    val allowsContinue: Boolean
        get() = ready && (step == ClassroomStep.RESULT || origin == MoveOrigin.ISSUED)

    /** A step kept from an earlier sitting: readable now, answerable once the refresh lands. */
    val waitingForTeacher: Boolean
        get() = ready && step in TAUGHT_STEPS && origin == MoveOrigin.CACHED

    private val ready: Boolean get() = started && audioHeard

    /** The lesson this step belongs to, for the one place that names it. */
    fun lessonTitle(language: AppLanguage): String? = move?.titleText(language)

    /** Whether there is anything for the teacher to say right now. */
    val canListen: Boolean
        get() = step !in setOf(ClassroomStep.LOADING, ClassroomStep.LOAD_FAILED, ClassroomStep.SUBMITTING) &&
            (move != null || turn != null)

    /** The plan event a recording answers, stamped on the submission for the teacher's memory. */
    val planEvent: Pair<String, String>?
        get() = move?.takeIf { it.kind == LessonMove.EVENT }?.let { it.planId to it.eventId }

    companion object {
        private val ANSWER_STEPS = setOf(ClassroomStep.TOGETHER, ClassroomStep.YOUR_TURN, ClassroomStep.QUICK_CHECK)
        private val TAUGHT_STEPS = ANSWER_STEPS + ClassroomStep.LEARN
    }
}

/** The screen a Gagné event needs: the teacher alone, saying it together, the learner's turn, or a check. */
fun LessonMove.firstStep(): ClassroomStep = when {
    kind == LessonMove.REST -> ClassroomStep.REST
    event == "elicit_performance" -> ClassroomStep.YOUR_TURN
    event == "assess_performance" -> ClassroomStep.QUICK_CHECK
    activity != null -> ClassroomStep.TOGETHER
    else -> ClassroomStep.LEARN
}

/** What she says on this screen: the step's published lines, or her own reply to the answer just marked. */
fun ClassroomState.audio(): List<TeacherLine> = when (step) {
    ClassroomStep.RESULT -> {
        val result = requireNotNull(turn)
        if (result.unmarked) listOf(TeacherUtterance.NO_SPEECH)
        else listOfNotNull(result.serverSampleId?.let(::TeacherReply))
    }
    else -> requireNotNull(move).promptUtterances
}
