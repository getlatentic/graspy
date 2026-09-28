package com.latentic.graspy.auth

import android.app.Activity
import android.util.Log
import androidx.credentials.Credential
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialOption
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuthException
import kotlinx.coroutines.CancellationException

/**
 * The Google account sheet, shown over [activity]: [askWhichAccount] leaves out signing the last account in without
 * asking. [activity] is used for this call only, never kept.
 */
fun interface GoogleAccountSheet {
    suspend fun signIn(activity: Activity, askWhichAccount: Boolean): SignInOutcome
}

sealed interface SignInOutcome {
    data class Succeeded(val userId: String) : SignInOutcome
    data object Cancelled : SignInOutcome
    data class Failed(val reason: String) : SignInOutcome
}

/** The phone's Google accounts in Credential Manager's sheet or, on a phone with none, Google's page in Chrome. */
class GoogleSignIn(
    private val session: FirebaseSession,
    private val serverClientId: String,
    private val phoneAccount: suspend (Activity, CredentialOption) -> Credential = ::phoneAccountCredential,
) : GoogleAccountSheet {
    override suspend fun signIn(activity: Activity, askWhichAccount: Boolean): SignInOutcome {
        if (AuthEmulator.enabled) return emulatorSignIn()
        if (interruptedSignInFinished()) return succeeded()
        for (option in signInOptions(serverClientId, askWhichAccount)) {
            onPhone(activity, option)?.let { return it }
        }
        return inBrowser(activity)
    }

    /** Null when the phone has no Google account for [option]. */
    private suspend fun onPhone(activity: Activity, option: CredentialOption): SignInOutcome? = try {
        val credential = phoneAccount(activity, option)
        if (credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            SignInOutcome.Failed("the account sheet returned an unsupported credential")
        } else {
            session.signInWithGoogle(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            succeeded()
        }
    } catch (_: GetCredentialCancellationException) {
        SignInOutcome.Cancelled
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: NoCredentialException) {
        null
    } catch (failure: GetCredentialException) {
        SignInOutcome.Failed(failure.message ?: "could not read a Google credential")
    } catch (failure: Exception) {
        SignInOutcome.Failed(failure.message ?: "Google sign-in failed")
    }

    private suspend fun inBrowser(activity: Activity): SignInOutcome = try {
        session.signInInBrowser(activity)
        succeeded()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: FirebaseAuthException) {
        when (failure.errorCode) {
            TAB_CLOSED -> SignInOutcome.Cancelled
            else -> SignInOutcome.Failed("${failure.errorCode}: ${failure.message}")
        }
    } catch (failure: Exception) {
        SignInOutcome.Failed(failure.message ?: "Google's sign-in page failed")
    }

    /** One that failed, or ended in a closed tab, leaves the sign-in asked for now to go ahead. */
    private suspend fun interruptedSignInFinished(): Boolean = try {
        session.finishInterruptedBrowserSignIn()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Log.w(TAG, "The sign-in Chrome was left with did not finish", failure)
        false
    }

    private suspend fun emulatorSignIn(): SignInOutcome = try {
        session.signInWithGoogle(AuthEmulator.GOOGLE_ACCOUNT)
        succeeded()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        SignInOutcome.Failed(failure.message ?: "The Auth emulator refused the sign-in")
    }

    private fun succeeded() = SignInOutcome.Succeeded(session.userId.orEmpty())

    private companion object {
        const val TAG = "GraspySignIn"

        // Firebase's code when the Chrome tab is closed before signing in.
        const val TAB_CLOSED = "ERROR_WEB_CONTEXT_CANCELED"
    }
}

private suspend fun phoneAccountCredential(activity: Activity, option: CredentialOption): Credential =
    CredentialManager.create(activity)
        .getCredential(activity, GetCredentialRequest.Builder().addCredentialOption(option).build())
        .credential

/**
 * The phone's accounts the sheet offers, in turn: the last one, signed in unasked, only when [askWhichAccount] is
 * false. Only ID-token options: each reports a phone without an account rather than adding one to the phone.
 */
internal fun signInOptions(serverClientId: String, askWhichAccount: Boolean): List<CredentialOption> = listOfNotNull(
    GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(true)
        .setServerClientId(serverClientId)
        .setAutoSelectEnabled(true)
        .build()
        .takeUnless { askWhichAccount },
    GetGoogleIdOption.Builder()
        .setFilterByAuthorizedAccounts(false)
        .setServerClientId(serverClientId)
        .build(),
)
