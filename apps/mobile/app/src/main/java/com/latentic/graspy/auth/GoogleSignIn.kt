package com.latentic.graspy.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialOption
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.latentic.graspy.R
import kotlinx.coroutines.CancellationException

/** The Google account sheet: [askWhichAccount] leaves out signing the last account in without asking. */
fun interface GoogleAccountSheet {
    suspend fun signIn(askWhichAccount: Boolean): SignInOutcome
}

sealed interface SignInOutcome {
    data class Succeeded(val userId: String) : SignInOutcome
    data object Cancelled : SignInOutcome
    data object NoAccountAvailable : SignInOutcome
    data class Failed(val reason: String) : SignInOutcome
}

class GoogleSignIn(
    private val context: Context,
    private val session: FirebaseSession,
    private val serverClientId: String = context.getString(R.string.default_web_client_id),
) : GoogleAccountSheet {
    override suspend fun signIn(askWhichAccount: Boolean): SignInOutcome {
        if (AuthEmulator.enabled) return emulatorSignIn()
        for (option in signInOptions(serverClientId, askWhichAccount)) {
            when (val outcome = attempt(option)) {
                SignInOutcome.NoAccountAvailable -> Unit
                else -> return outcome
            }
        }
        return SignInOutcome.NoAccountAvailable
    }

    private suspend fun attempt(option: CredentialOption): SignInOutcome = try {
        val response = CredentialManager.create(context).getCredential(
            context,
            GetCredentialRequest.Builder().addCredentialOption(option).build(),
        )
        val credential = response.credential
        if (credential !is CustomCredential ||
            credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            SignInOutcome.Failed("the account sheet returned an unsupported credential")
        } else {
            signedIn(GoogleIdTokenCredential.createFrom(credential.data).idToken)
        }
    } catch (_: GetCredentialCancellationException) {
        SignInOutcome.Cancelled
    } catch (_: NoCredentialException) {
        SignInOutcome.NoAccountAvailable
    } catch (failure: GetCredentialException) {
        SignInOutcome.Failed(failure.message ?: "could not read a Google credential")
    } catch (failure: Exception) {
        SignInOutcome.Failed(failure.message ?: "Google sign-in failed")
    }

    private suspend fun emulatorSignIn(): SignInOutcome = try {
        signedIn(AuthEmulator.GOOGLE_ACCOUNT)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        SignInOutcome.Failed(failure.message ?: "The Auth emulator refused the sign-in")
    }

    private suspend fun signedIn(googleIdToken: String): SignInOutcome {
        session.signInWithGoogle(googleIdToken)
        return SignInOutcome.Succeeded(session.userId.orEmpty())
    }
}

/** The accounts the sheet offers, in turn: the last one, signed in unasked, only when [askWhichAccount] is false. */
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
    GetSignInWithGoogleOption.Builder(serverClientId).build(),
)
