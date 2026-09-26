package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.SubmissionStatus

/** Deterministic timeline states of one voice-note lesson. */
enum class LessonPhase {
    PREVIEW,
    TEACHER_BUFFERING,
    TEACHER_PLAYING,
    LEARNER_READY,
    LEARNER_RECORDING,
    UPLOADING,
    ANALYSING,
    FEEDBACK_BUFFERING,
    FEEDBACK_PLAYING,
    COMPLETE,
    SEND_FAILED,
    ;

    val canRecord: Boolean get() = this == LEARNER_READY || this == COMPLETE || this == SEND_FAILED
    val showsTeacherPrompt: Boolean get() = this != PREVIEW
    val showsLearnerNote: Boolean get() = ordinal >= LEARNER_RECORDING.ordinal
    val showsFeedback: Boolean get() = this != SEND_FAILED && ordinal >= FEEDBACK_BUFFERING.ordinal
}

data class LessonSignals(
    val lessonStarted: Boolean,
    val teacherVoice: TeacherVoiceState,
    val promptCompleted: Boolean,
    val recording: Boolean,
    val saving: Boolean,
    val submissionStatus: SubmissionStatus?,
    val serverSampleId: String?,
    val hasOutcome: Boolean,
    val feedbackStarted: Boolean,
    val feedbackCompleted: Boolean,
)

fun lessonPhase(signals: LessonSignals): LessonPhase = when {
    !signals.lessonStarted -> LessonPhase.PREVIEW
    signals.recording -> LessonPhase.LEARNER_RECORDING
    signals.saving -> LessonPhase.UPLOADING
    signals.hasOutcome -> feedbackPhase(signals)
    !signals.promptCompleted -> when (signals.teacherVoice) {
        TeacherVoiceState.SPEAKING -> LessonPhase.TEACHER_PLAYING
        else -> LessonPhase.TEACHER_BUFFERING
    }
    signals.submissionStatus == SubmissionStatus.PENDING ||
        signals.submissionStatus == SubmissionStatus.UPLOADING ->
        if (signals.serverSampleId == null) LessonPhase.UPLOADING else LessonPhase.ANALYSING
    signals.teacherVoice == TeacherVoiceState.SPEAKING -> LessonPhase.TEACHER_PLAYING
    signals.submissionStatus == SubmissionStatus.FAILED -> LessonPhase.SEND_FAILED
    else -> LessonPhase.LEARNER_READY
}

private fun feedbackPhase(signals: LessonSignals): LessonPhase = when {
    signals.teacherVoice == TeacherVoiceState.SPEAKING -> LessonPhase.FEEDBACK_PLAYING
    signals.feedbackCompleted -> LessonPhase.COMPLETE
    signals.teacherVoice == TeacherVoiceState.FAILED -> LessonPhase.COMPLETE
    else -> LessonPhase.FEEDBACK_BUFFERING
}
