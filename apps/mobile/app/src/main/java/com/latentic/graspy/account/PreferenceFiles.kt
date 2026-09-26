package com.latentic.graspy.account

/** The preferences files graspy writes, named in one place so a wipe cannot miss one. */
object PreferenceFiles {
    const val ACCOUNT = "graspy_account"
    const val DEVICE = "graspy_device"
    const val PROFILES = "graspy_profile"
    const val DEVICE_LANGUAGE = "graspy_language"

    /** The app's words, chosen for the phone: kept when anyone signs out. */
    const val INTERFACE = "graspy_interface"
    const val PLAYBACK = "lesson-playback"
    /** No longer written; earlier versions left it, so a wipe still clears it. */
    const val CONSENT = "graspy_recording_consent"
    const val IDENTITY = "graspy_identity"

    /** The learner's plan and record as last read, so their subjects show without a connection. */
    const val PLAN = "graspy_plan"

    /** What the learner in use kept: gone when the device takes another learner. */
    val learnerData: List<String> = listOf(PLAYBACK, CONSENT, IDENTITY, PLAN)
}
