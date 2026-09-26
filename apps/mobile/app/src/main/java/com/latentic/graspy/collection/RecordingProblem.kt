package com.latentic.graspy.collection

import com.latentic.graspy.localization.AppCopy

/** Why a recording could not be made or kept on the phone. */
enum class RecordingProblem { MICROPHONE_DENIED, NOT_STARTED, NOT_SAVED }

fun RecordingProblem.text(copy: AppCopy): String = when (this) {
    RecordingProblem.MICROPHONE_DENIED -> copy.microphoneNeeded
    RecordingProblem.NOT_STARTED -> copy.recordingNotStarted
    RecordingProblem.NOT_SAVED -> copy.recordingNotSaved
}
