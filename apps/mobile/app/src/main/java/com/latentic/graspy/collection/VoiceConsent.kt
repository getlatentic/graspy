package com.latentic.graspy.collection

import com.latentic.graspy.localization.LearnerProfileStore

/**
 * A learner's voice is recorded only once they have been told, before their first voice lesson, that
 * graspy sends it to check their answers. Seen once per learner, on this device, with their other choices.
 */
class VoiceConsent(private val profiles: LearnerProfileStore, private val learnerInUse: () -> String?) {
    /** True until the learner in use has seen the note; with no learner, nothing may be recorded. */
    fun needed(): Boolean = learnerInUse()?.let { !profiles.voiceNoteSeen(it) } ?: true

    fun accept() {
        learnerInUse()?.let(profiles::seeVoiceNote)
    }

    /** Starts [record] only once the note has been seen; false when it did not start. */
    fun whenSeen(record: () -> Unit): Boolean {
        if (needed()) return false
        record()
        return true
    }
}
