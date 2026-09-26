package com.latentic.graspy.collection

import com.latentic.graspy.network.refusalCode

/** What a voice call refused, as the server names it. Several share the status 409, so only the code decides. */
enum class VoiceRefusal(val code: String) {
    /** The step answered was never given to this learner: take the step the server gives now. */
    STEP_NOT_OFFERED("step_not_offered"),

    /** The recording was marked before its audio arrived: send it again. */
    AUDIO_NOT_READY("audio_not_ready"),

    /** The recording answers something no lesson asks. */
    UNSUPPORTED_PROMPT("unsupported_prompt"),

    /** The recording's key was already used for a different recording. */
    IDEMPOTENCY_CONFLICT("idempotency_conflict"),

    /** The session names no learner: the device must choose who is learning. */
    LEARNER_REQUIRED("learner_required"),
    ;

    companion object {
        fun of(error: Throwable): VoiceRefusal? = refusalCode(error)?.let { code -> entries.firstOrNull { it.code == code } }
    }
}
