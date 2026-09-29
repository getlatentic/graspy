package com.latentic.graspy.auth

import android.app.Activity
import java.io.IOException

/** The Firebase ID token of a sign-in made just now. It goes into one request and is neither logged nor kept. */
class FreshSignIn(val idToken: String) {
    override fun toString() = "FreshSignIn"
}

sealed interface Confirmation {
    data class Confirmed(val signIn: FreshSignIn) : Confirmation

    /** The parent closed Google's sheet or page. */
    data object Cancelled : Confirmation

    /** The Google account chosen is not the one signed in to graspy. */
    data object OtherAccount : Confirmation

    data class Failed(val reason: String) : Confirmation
}

/** A parent proves they are there: the signed-in account signs in with Google again. */
fun interface ParentConfirmation {
    /** [activity] shows Google's sheet or page for this call only, never kept. */
    suspend fun confirm(activity: Activity): Confirmation
}

/** Google's sign-in again through [GoogleSignIn], and then a new ID token read from Firebase. */
class GoogleParentConfirmation(
    private val google: GoogleSignIn,
    private val firebase: FirebaseSession,
) : ParentConfirmation {
    override suspend fun confirm(activity: Activity): Confirmation {
        val uid = firebase.userId ?: return Confirmation.Failed("Nobody is signed in")
        return when (val outcome = google.reconfirm(activity)) {
            is SignInOutcome.Succeeded -> freshToken(uid)
            SignInOutcome.Cancelled -> Confirmation.Cancelled
            SignInOutcome.OtherAccount -> Confirmation.OtherAccount
            is SignInOutcome.Failed -> Confirmation.Failed(outcome.reason)
        }
    }

    private suspend fun freshToken(uid: String): Confirmation = try {
        firebase.idToken(uid, fresh = true)?.let { Confirmation.Confirmed(FreshSignIn(it)) }
            ?: Confirmation.Failed("Google no longer holds the sign-in")
    } catch (offline: IOException) {
        Confirmation.Failed(offline.message ?: "Google could not be reached")
    }
}
