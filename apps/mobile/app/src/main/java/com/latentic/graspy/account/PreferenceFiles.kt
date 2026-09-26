package com.latentic.graspy.account

/** The preferences files graspy writes, named in one place so a wipe cannot miss one. */
object PreferenceFiles {
    const val ACCOUNT = "graspy_account"
    const val DEVICE = "graspy_device"
    const val PROFILES = "graspy_profile"
    const val DEVICE_LANGUAGE = "graspy_language"
    const val PLAYBACK = "lesson-playback"
    const val CONSENT = "graspy_recording_consent"
    const val IDENTITY = "graspy_identity"

    /** What the learner in use kept: gone when the device takes another learner. */
    val learnerData: List<String> = listOf(PLAYBACK, CONSENT, IDENTITY)
}
