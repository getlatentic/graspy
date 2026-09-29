package com.latentic.graspy.auth

import androidx.credentials.Credential
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.gms.tasks.Tasks
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.demoFirebase
import com.latentic.graspy.account.hostActivity
import java.io.IOException
import java.util.Base64
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A parent proves they are there by signing in with Google again; the token a request carries is one Firebase made just now. */
@RunWith(RobolectricTestRunner::class)
class ParentConfirmationTest {
    private val activity = hostActivity()
    private var phone: () -> Credential = { throw NoCredentialException() }
    private var reauth = Tasks.forResult<Void>(null)

    /** What Firebase is asked for the ID token: whether a new one was forced, and whose. */
    private val tokenAsks = mutableListOf<Pair<String, Boolean>>()
    private var held: String? = "token-made-just-now"
    private var offline = false

    private val firebase = object : FirebaseSession(
        FirebaseAuth.getInstance(demoFirebase()),
        clearCredentials = {},
        reauthenticateWithCredential = { reauth },
        reauthenticateWithProvider = { _, _ -> Tasks.forResult(null) },
    ) {
        override val userId: String? = UID

        override suspend fun idToken(uid: String, fresh: Boolean): String? {
            tokenAsks += uid to fresh
            if (offline) throw IOException("Google could not be reached")
            return held
        }
    }

    private val confirmation = GoogleParentConfirmation(GoogleSignIn(firebase, "demo-client") { _, _ -> phone() }, firebase)

    private fun confirm() = runBlocking { confirmation.confirm(activity) }

    @Test
    fun `a parent who signs in again is confirmed with an ID token Firebase was made to issue anew`() {
        phone = { googleAccount() }

        val confirmed = confirm()

        assertEquals("token-made-just-now", (confirmed as Confirmation.Confirmed).signIn.idToken)
        assertEquals(listOf(UID to true), tokenAsks)
    }

    @Test
    fun `on Google's page too`() {
        val confirmed = confirm()

        assertEquals("token-made-just-now", (confirmed as Confirmation.Confirmed).signIn.idToken)
        assertEquals(listOf(UID to true), tokenAsks)
    }

    @Test
    fun `closing Google's sheet confirms nothing and asks Firebase for no token`() {
        phone = { throw GetCredentialCancellationException() }

        assertEquals(Confirmation.Cancelled, confirm())
        assertTrue(tokenAsks.isEmpty())
    }

    @Test
    fun `another account's Google sign-in confirms nothing`() {
        phone = { googleAccount() }
        reauth = Tasks.forException(FirebaseAuthInvalidCredentialsException("ERROR_USER_MISMATCH", "not this user's"))

        assertEquals(Confirmation.OtherAccount, confirm())
        assertTrue(tokenAsks.isEmpty())
    }

    @Test
    fun `a sign-in Firebase no longer holds, or that cannot reach Google for the token, confirms nothing`() {
        phone = { googleAccount() }
        held = null
        assertTrue(confirm() is Confirmation.Failed)

        held = "token"
        offline = true
        assertTrue(confirm() is Confirmation.Failed)
    }

    @Test
    fun `nobody signed in confirms nothing`() {
        val nobody = object : FirebaseSession(FirebaseAuth.getInstance(demoFirebase()), clearCredentials = {}) {
            override val userId: String? = null
        }

        val outcome = runBlocking { GoogleParentConfirmation(GoogleSignIn(nobody, "demo-client"), nobody).confirm(activity) }

        assertTrue(outcome is Confirmation.Failed)
    }

    @Test
    fun `printing a confirmation never shows the token`() {
        val printed = listOf(FreshSignIn("secret-token"), Confirmation.Confirmed(FreshSignIn("secret-token"))).joinToString()

        assertFalse(printed, printed.contains("secret-token"))
    }

    private fun googleAccount(): Credential = GoogleIdTokenCredential.Builder()
        .setId("parent@example.com")
        .setIdToken(listOf("""{"alg":"RS256"}""", """{"sub":"1"}""", "signature").joinToString(".") {
            Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray())
        })
        .build()
}
