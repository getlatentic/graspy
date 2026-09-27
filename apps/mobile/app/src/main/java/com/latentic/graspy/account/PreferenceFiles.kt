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

    /**
     * That a sign-out has yet to forget its Google account, and that a sign-in, sign-out or leave may have left
     * Firebase's user on disk: kept through the wipe, so the next start finishes the one and undoes the other.
     */
    const val SIGN_OUT = "graspy_sign_out"

    /** The learner's plan and record as last read, so their subjects show without a connection. */
    const val PLAN = "graspy_plan"

    /** How far the phone has read the learner's conversations from their other devices. */
    const val THREADS = "graspy_threads"

    /** What the learner in use kept: gone when the device takes another learner. */
    val learnerData: List<String> = listOf(PLAYBACK, CONSENT, IDENTITY, PLAN, THREADS)
}
