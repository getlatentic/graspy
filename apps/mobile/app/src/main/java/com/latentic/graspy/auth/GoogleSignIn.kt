package com.latentic.graspy.auth

import android.app.Activity
import androidx.credentials.Credential
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialOption
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
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

    /** Only when confirming: the Google account chosen is not the one signed in to graspy. */
    data object OtherAccount : SignInOutcome
    data class Failed(val reason: String) : SignInOutcome
}

/** The phone's Google accounts in Credential Manager's sheet or, on a phone with none, Google's page in Chrome. */
class GoogleSignIn(
    private val session: FirebaseSession,
    private val serverClientId: String,
    private val phoneAccount: suspend (Activity, CredentialOption) -> Credential = ::phoneAccountCredential,
) : GoogleAccountSheet {
    /** What Firebase does with what Google returns: sign a user in, or sign the current user in again. */
    private class Way(
        val withGoogleToken: suspend (String) -> Unit,
        val inBrowser: suspend (Activity) -> Unit,
        val asEmulatorAccount: suspend () -> Unit,
    )

    private val signingIn = Way(
        session::signInWithGoogle,
        session::signInInBrowser,
        { session.signInWithGoogle(AuthEmulator.GOOGLE_ACCOUNT) },
    )

    private val confirming = Way(
        session::reauthenticateWithGoogle,
        session::reauthenticateInBrowser,
        { session.reauthenticateWithGoogle(AuthEmulator.GOOGLE_ACCOUNT) },
    )

    override suspend fun signIn(activity: Activity, askWhichAccount: Boolean): SignInOutcome =
        through(activity, askWhichAccount, signingIn)

    /**
     * The signed-in user signs in with Google again, so their ID token carries the time of this sign-in. It always
     * asks which account: taking the last one unasked would confirm nothing.
     */
    suspend fun reconfirm(activity: Activity): SignInOutcome = through(activity, askWhichAccount = true, confirming)

    private suspend fun through(activity: Activity, askWhichAccount: Boolean, way: Way): SignInOutcome {
        if (AuthEmulator.enabled) return asEmulatorAccount(way)
        for (option in signInOptions(serverClientId, askWhichAccount)) {
            onPhone(activity, option, way)?.let { return it }
        }
        return inBrowser(activity, way)
    }

    /** Null when the phone has no Google account for [option], or no Credential Manager to offer one. */
    private suspend fun onPhone(activity: Activity, option: CredentialOption, way: Way): SignInOutcome? = try {
        val credential = phoneAccount(activity, option)
        if (credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            SignInOutcome.Failed("the account sheet returned an unsupported credential")
        } else {
            way.withGoogleToken(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            succeeded()
        }
    } catch (_: GetCredentialCancellationException) {
        SignInOutcome.Cancelled
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: NoCredentialException) {
        null
    } catch (_: GetCredentialProviderConfigurationException) {
        null
    } catch (_: GetCredentialUnsupportedException) {
        null
    } catch (failure: GetCredentialException) {
        SignInOutcome.Failed(failure.message ?: "could not read a Google credential")
    } catch (failure: FirebaseAuthException) {
        if (failure.errorCode == USER_MISMATCH) SignInOutcome.OtherAccount else failed(failure, "Google sign-in failed")
    } catch (failure: Exception) {
        failed(failure, "Google sign-in failed")
    }

    private suspend fun inBrowser(activity: Activity, way: Way): SignInOutcome = try {
        way.inBrowser(activity)
        succeeded()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: FirebaseAuthException) {
        when (failure.errorCode) {
            TAB_CLOSED -> SignInOutcome.Cancelled
            USER_MISMATCH -> SignInOutcome.OtherAccount
            else -> SignInOutcome.Failed("${failure.errorCode}: ${failure.message}")
        }
    } catch (failure: Exception) {
        SignInOutcome.Failed(failure.message ?: "Google's sign-in page failed")
    }

    private suspend fun asEmulatorAccount(way: Way): SignInOutcome = try {
        way.asEmulatorAccount()
        succeeded()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        SignInOutcome.Failed(failure.message ?: "The Auth emulator refused the sign-in")
    }

    private fun succeeded() = SignInOutcome.Succeeded(session.userId.orEmpty())

    private fun failed(failure: Exception, fallback: String) = SignInOutcome.Failed(failure.message ?: fallback)

    private companion object {
        // Firebase's code when the Chrome tab is closed before signing in.
        const val TAB_CLOSED = "ERROR_WEB_CONTEXT_CANCELED"

        // Firebase's code when signing in again with Google's credential for another user than the signed-in one.
        const val USER_MISMATCH = "ERROR_USER_MISMATCH"
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
