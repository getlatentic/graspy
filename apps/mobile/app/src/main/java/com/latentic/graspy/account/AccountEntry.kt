package com.latentic.graspy.account

import android.content.Context
import android.util.Log
import androidx.core.content.edit
import com.latentic.graspy.auth.FirebaseSession
import com.latentic.graspy.auth.GoogleAccountSheet
import com.latentic.graspy.auth.SignInOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** How an account comes onto this device and leaves it. */
class AccountEntry(
    private val context: Context,
    private val google: GoogleAccountSheet,
    private val firebase: FirebaseSession,
    private val accounts: AccountStore,
    private val sessions: SessionTokens,
    private val sessionApi: SessionApi,
    private val deviceIds: DeviceIdStore,
    private val wipe: DeviceWipe,
) {
    private val signingOut = Mutex()
    private val forgetting = context.getSharedPreferences(PreferenceFiles.SIGN_OUT, 0)

    /** Google confirms who it is, graspy issues the account's session, and the account asks who is learning. */
    suspend fun signIn(): SignInOutcome {
        val outcome = google.signIn(askWhichAccount = !lastGoogleAccountForgotten())
        // A failed sign-in may have got as far as a Google account (Firebase refusing its credential); forgetting
        // it on any failure keeps the next sign-in from taking it unasked, at worst asking once more than needed.
        if (outcome is SignInOutcome.Failed) forgetGoogleAccountOrLeaveMarked()
        if (outcome !is SignInOutcome.Succeeded) return outcome
        return try {
            startAccountSession(outcome.userId)
            outcome
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "graspy did not issue the account's session", error)
            firebase.signOut()
            forgetGoogleAccountOrLeaveMarked()
            SignInOutcome.Failed(error.message ?: "graspy did not issue a session")
        }
    }

    /**
     * Nothing of the account or its learners stays on the device. Firebase goes first, so a sign-out cut short
     * finds the account still here and Firebase signed out, and [reconcile] finishes it at the next start. The
     * Google account is forgotten last: it waits on Play services, and the wipe must not.
     */
    suspend fun signOut() {
        // A sign-out asked for again while one runs (a session refused mid-wipe, the start's reconcile) waits for
        // it, and then has nothing left to do.
        val signedOut = signingOut.withLock {
            if (accounts.account.value == null && firebase.userId == null) return@withLock false
            markGoogleAccountToForget()
            firebase.signOut()
            wipe.wipeDevice()
            true
        }
        if (signedOut) forgetGoogleAccountOrLeaveMarked()
    }

    /**
     * Before a learner is chosen the device holds only its own learning, which stays. The account goes before
     * Firebase: cut short between them, the next start signs the account back in rather than wiping that learning.
     */
    suspend fun leaveForAnotherAccount() {
        markGoogleAccountToForget()
        sessions.forget()
        accounts.set(null)
        firebase.signOut()
        forgetGoogleAccountOrLeaveMarked()
    }

    /** The mark goes only once done, so a Google account Play services could not forget is forgotten later. */
    private suspend fun forgetGoogleAccount() {
        firebase.forgetGoogleAccount(context)
        forgetting.edit(commit = true) { remove(GOOGLE_ACCOUNT) }
    }

    /** Before anything the account leaves by, so a leave cut short at any point still has it forgotten. */
    private fun markGoogleAccountToForget() = forgetting.edit(commit = true) { putBoolean(GOOGLE_ACCOUNT, true) }

    private suspend fun forgetGoogleAccountOrLeaveMarked() {
        markGoogleAccountToForget()
        try {
            forgetGoogleAccount()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "Forgetting the Google account failed; it is forgotten before the next sign-in", error)
        }
    }

    /**
     * Before a sign-in: a sign-out still running is waited for, and a Google account one could not forget is
     * forgotten now. False when it still cannot be, so the sign-in asks which account rather than taking it.
     */
    private suspend fun lastGoogleAccountForgotten(): Boolean = signingOut.withLock {
        if (!forgetting.getBoolean(GOOGLE_ACCOUNT, false)) return@withLock true
        try {
            forgetGoogleAccount()
            true
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "Forgetting the last Google account failed; the sign-in asks which account", error)
            false
        }
    }

    /**
     * At start. An account signed in before accounts held learners is kept, and its learning here
     * joins the first learner chosen; an account Firebase no longer holds is signed out; and a
     * sign-out that had yet to forget its Google account forgets it.
     */
    fun reconcile(scope: CoroutineScope) {
        val uid = firebase.userId
        val account = accounts.account.value
        when {
            uid != null && account == null -> accounts.set(Account(uid, firebase.email, learner = null, deviceJoins = true))
            account != null && account.uid != uid -> scope.finish("Finishing a sign-out") { signOut() }
            account == null && forgetting.getBoolean(GOOGLE_ACCOUNT, false) ->
                scope.finish("Forgetting the signed-out Google account") { forgetGoogleAccount() }
        }
    }

    /** Work at start fails into the log: the app's scope has no handler, so an error there would end the app. */
    private fun CoroutineScope.finish(what: String, work: suspend () -> Unit) = launch {
        try {
            work()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "$what failed", error)
        }
    }

    private suspend fun startAccountSession(uid: String) {
        val idToken = checkNotNull(firebase.idToken(uid, fresh = false)) { "Google did not confirm the sign-in" }
        val issued = sessionApi.session(SessionRequestDto(deviceId = deviceIds.current(), firebaseIdToken = idToken))
        accounts.set(Account(uid, firebase.email, learner = null, deviceJoins = true))
        sessions.keep(uid, issued)
    }

    private companion object {
        const val TAG = "GraspyAccount"
        const val GOOGLE_ACCOUNT = "google_account"
    }
}
