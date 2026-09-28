package com.latentic.graspy.auth

import android.app.Activity
import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FederatedAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.OAuthProvider
import java.io.IOException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

open class FirebaseSession(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val clearCredentials: suspend (Context) -> Unit = ::clearCredentialState,
    private val signInWithCredential: (AuthCredential) -> Task<AuthResult> = auth::signInWithCredential,
    private val pendingBrowserSignIn: () -> Task<AuthResult>? = { auth.pendingAuthResult },
    private val signInWithProvider: (Activity, FederatedAuthProvider) -> Task<AuthResult> =
        auth::startActivityForSignInWithProvider,
) {
    // Firebase offers the same interrupted sign-in for an hour, so one already finished is not finished again.
    private var finishedBrowserSignIn: Task<AuthResult>? = null

    open val userId: String? get() = auth.currentUser?.uid
    val email: String? get() = auth.currentUser?.email

    /**
     * Firebase finishes a sign-in once asked for, whether or not its caller is cancelled, so it is waited out: a
     * caller cancelled meanwhile then signs out a sign-in that has ended, and none completes after it.
     */
    suspend fun signInWithGoogle(googleIdToken: String) {
        val credential = GoogleAuthProvider.getCredential(googleIdToken, null)
        withContext(NonCancellable) { signInWithCredential(credential).await() }
    }

    /**
     * On Google's own sign-in page in a Chrome tab, which adds no account to the phone, waited out as
     * [signInWithGoogle] is. The page always asks which account: a sign-out cannot forget Chrome's Google session.
     */
    suspend fun signInInBrowser(activity: Activity) {
        val google = OAuthProvider.newBuilder(GoogleAuthProvider.PROVIDER_ID, auth)
            .addCustomParameter("prompt", "select_account")
            .build()
        withContext(NonCancellable) { signInWithProvider(activity, google).await() }
    }

    /**
     * A browser sign-in the system stopped the app during, which Firebase takes up again when it next starts, is
     * finished here: true once it is, false when there is none. Waited out as [signInWithGoogle] is.
     */
    suspend fun finishInterruptedBrowserSignIn(): Boolean {
        val pending = pendingBrowserSignIn()?.takeIf { it !== finishedBrowserSignIn } ?: return false
        finishedBrowserSignIn = pending
        withContext(NonCancellable) { pending.await() }
        return true
    }

    /** At once; the Google account the sign-in used is forgotten apart from it, by [forgetGoogleAccount]. */
    open fun signOut() = auth.signOut()

    /** So the next sign-in asks which Google account rather than taking the last one. It can wait on Play services. */
    suspend fun forgetGoogleAccount(context: Context) = clearCredentials(context)

    /** Null when Firebase no longer holds [uid]'s sign-in: signed out, disabled or deleted. */
    open suspend fun idToken(uid: String, fresh: Boolean): String? {
        val user = auth.currentUser?.takeIf { it.uid == uid } ?: return null
        return try {
            user.getIdToken(fresh).await().token
        } catch (_: FirebaseAuthInvalidUserException) {
            null
        } catch (offline: FirebaseNetworkException) {
            throw IOException("Google could not be reached to confirm the sign-in", offline)
        }
    }
}

private suspend fun clearCredentialState(context: Context) {
    CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
}
