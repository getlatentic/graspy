package com.latentic.graspy.auth

import com.google.firebase.auth.FirebaseAuth
import com.latentic.graspy.BuildConfig

/**
 * A debug build given `GRASPY_AUTH_EMULATOR` signs in to Firebase's Auth emulator, as the web app does
 * locally, so the account screens can be driven without a Google account. Release builds never do.
 */
object AuthEmulator {
    val enabled: Boolean get() = BuildConfig.AUTH_EMULATOR.isNotEmpty()

    /** Before Firebase Auth is used for anything else. */
    fun connect(auth: FirebaseAuth = FirebaseAuth.getInstance()) {
        if (!enabled) return
        val (host, port) = BuildConfig.AUTH_EMULATOR.split(":")
        auth.useEmulator(host, port.toInt())
    }

    /** The emulator takes a made-up Google account in place of a signed ID token. */
    const val GOOGLE_ACCOUNT = """{"sub":"graspy-emulator-parent","email":"parent@example.com","email_verified":true}"""
}
