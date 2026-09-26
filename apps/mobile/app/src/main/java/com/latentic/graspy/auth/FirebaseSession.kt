package com.latentic.graspy.auth

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.GoogleAuthProvider
import java.io.IOException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

open class FirebaseSession(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val clearCredentials: suspend (Context) -> Unit = ::clearCredentialState,
    private val signInWithCredential: (AuthCredential) -> Task<AuthResult> = auth::signInWithCredential,
) {
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

    /** At once; the Google account the sign-in used is forgotten apart from it, by [forgetGoogleAccount]. */
    open fun signOut() = auth.signOut()

    /** So the next sign-in asks which Google account rather than taking the last one. It can wait on Play services. */
    suspend fun forgetGoogleAccount(context: Context) = clearCredentials(context)

    /** Null when Firebase no longer holds [uid]'s sign-in: signed out, disabled or deleted. */
    suspend fun idToken(uid: String, fresh: Boolean): String? {
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
