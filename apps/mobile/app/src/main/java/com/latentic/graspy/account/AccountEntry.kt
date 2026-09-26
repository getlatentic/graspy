package com.latentic.graspy.account

import android.content.Context
import android.util.Log
import com.latentic.graspy.auth.FirebaseSession
import com.latentic.graspy.auth.GoogleSignIn
import com.latentic.graspy.auth.SignInOutcome
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** How an account comes onto this device and leaves it. */
class AccountEntry(
    private val context: Context,
    private val google: GoogleSignIn,
    private val firebase: FirebaseSession,
    private val accounts: AccountStore,
    private val sessions: SessionTokens,
    private val sessionApi: SessionApi,
    private val deviceIds: DeviceIdStore,
    private val wipe: DeviceWipe,
) {
    private val signingOut = Mutex()

    /** Google confirms who it is, graspy issues the account's session, and the account asks who is learning. */
    suspend fun signIn(): SignInOutcome {
        val outcome = google.signIn()
        if (outcome !is SignInOutcome.Succeeded) return outcome
        return try {
            startAccountSession(outcome.userId)
            outcome
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "graspy did not issue the account's session", error)
            firebase.signOut()
            firebase.forgetGoogleAccount(context)
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
            firebase.signOut()
            wipe.wipeDevice()
            true
        }
        if (signedOut) firebase.forgetGoogleAccount(context)
    }

    /** Before a learner is chosen the device holds only its own learning, which stays. */
    suspend fun leaveForAnotherAccount() {
        sessions.forget()
        accounts.set(null)
        firebase.signOut()
        firebase.forgetGoogleAccount(context)
    }

    /**
     * At start. An account signed in before accounts held learners is kept, and its learning here
     * joins the first learner chosen; an account Firebase no longer holds is signed out.
     */
    fun reconcile(scope: CoroutineScope) {
        val uid = firebase.userId
        val account = accounts.account.value
        if (uid != null && account == null) {
            accounts.set(Account(uid, firebase.email, learner = null, deviceJoins = true))
        } else if (account != null && account.uid != uid) {
            scope.launch {
                try {
                    signOut()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    Log.w(TAG, "Finishing a sign-out failed", error)
                }
            }
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
    }
}
