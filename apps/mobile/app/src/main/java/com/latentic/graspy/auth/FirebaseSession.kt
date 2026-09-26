package com.latentic.graspy.auth

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.GoogleAuthProvider
import java.io.IOException
import kotlinx.coroutines.tasks.await

class FirebaseSession(private val auth: FirebaseAuth = FirebaseAuth.getInstance()) {
    val userId: String? get() = auth.currentUser?.uid
    val email: String? get() = auth.currentUser?.email

    suspend fun signInWithGoogle(googleIdToken: String) {
        auth.signInWithCredential(GoogleAuthProvider.getCredential(googleIdToken, null)).await()
    }

    suspend fun signOut(context: Context) {
        auth.signOut()
        CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
    }

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
