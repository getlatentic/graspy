package com.latentic.graspy.practice

/**
 * Who holds the floor right now. The pill under her portrait, her face and the round control all follow
 * this one answer, so the turn passes on screen in a single change instead of three that drift apart.
 */
enum class LessonFloor {
    /** She is talking, or fetching the line she is about to say. */
    TEACHER,

    /** Her question is finished and the microphone is waiting for the child's tap. */
    CHILD,

    /** The microphone is open and hearing the child. */
    CHILD_SPEAKING,

    /** The answer is being kept, sent or marked. */
    CHECKING,

    /** She is quiet and nothing is asked: her line can be heard again. */
    QUIET,

    /** Nothing to hear or answer yet. */
    NONE,
}

fun lessonFloor(
    classroom: ClassroomState,
    voice: TeacherVoiceState,
    recording: Boolean,
    saving: Boolean,
): LessonFloor = when {
    recording -> LessonFloor.CHILD_SPEAKING
    voice == TeacherVoiceState.SPEAKING || voice == TeacherVoiceState.BUFFERING -> LessonFloor.TEACHER
    saving || classroom.step == ClassroomStep.SUBMITTING -> LessonFloor.CHECKING
    classroom.allowsAnswer -> LessonFloor.CHILD
    classroom.canListen -> LessonFloor.QUIET
    else -> LessonFloor.NONE
}

/**
 * What the one round button under the lesson does right now. It is the only button on the screen, it
 * never disappears and never changes size: only its icon and colour follow the turn.
 */
enum class TurnButton {
    /** She is talking: a tap stops her. */
    STOP_TEACHER,

    /** She is quiet: a tap says her line again. */
    HEAR_AGAIN,

    /** The child's turn: a tap opens the microphone. */
    RECORD,

    /** The microphone is open: a tap finishes the answer. */
    FINISH,

    /** Something is on its way: nothing to tap. */
    WAIT,

    /** The lesson could not load: a tap asks again. */
    RETRY,
}

fun turnButton(floor: LessonFloor, classroom: ClassroomState): TurnButton = when (floor) {
    LessonFloor.TEACHER -> TurnButton.STOP_TEACHER
    LessonFloor.CHILD -> TurnButton.RECORD
    LessonFloor.CHILD_SPEAKING -> TurnButton.FINISH
    LessonFloor.CHECKING -> TurnButton.WAIT
    LessonFloor.QUIET -> when {
        // A kept step becomes answerable only when a refresh lands; one that failed is asked again by hand.
        classroom.waitingForTeacher && classroom.refreshFailed -> TurnButton.RETRY
        classroom.waitingForTeacher -> TurnButton.WAIT
        else -> TurnButton.HEAR_AGAIN
    }
    LessonFloor.NONE -> if (classroom.step == ClassroomStep.LOAD_FAILED) TurnButton.RETRY else TurnButton.WAIT
}

/** What the pill under her portrait says: whose voice it is. */
enum class TurnCue { TEACHER_SPEAKING, YOUR_TURN }

/**
 * "Your turn" from the moment her question ends, not from the tap it asks for. Her pill waits for sound,
 * as her mouth does: fetching her line says nothing yet.
 */
fun turnCue(floor: LessonFloor, voice: TeacherVoiceState): TurnCue? = when {
    floor == LessonFloor.CHILD || floor == LessonFloor.CHILD_SPEAKING -> TurnCue.YOUR_TURN
    voice == TeacherVoiceState.SPEAKING -> TurnCue.TEACHER_SPEAKING
    else -> null
}
