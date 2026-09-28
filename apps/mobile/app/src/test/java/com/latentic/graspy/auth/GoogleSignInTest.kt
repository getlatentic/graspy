package com.latentic.graspy.auth

import android.app.Activity
import androidx.credentials.Credential
import androidx.credentials.CredentialOption
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FederatedAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.OAuthProvider
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.demoFirebase
import com.latentic.graspy.account.hostActivity
import java.util.Base64
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A phone without a Google account signs in on Google's own page in Chrome, and never adds one to the phone. */
@RunWith(RobolectricTestRunner::class)
class GoogleSignInTest {
    private val activity = hostActivity()

    /** The options the account sheet was shown with, and the activity it was shown over. */
    private val sheets = mutableListOf<Pair<Activity, CredentialOption>>()
    private var phone: () -> Credential = { throw NoCredentialException() }

    /** Each opening of Google's page, and the activity it was opened over. */
    private val pages = mutableListOf<Pair<Activity, FederatedAuthProvider>>()
    private var page: Task<AuthResult> = Tasks.forResult(null)

    private var interrupted: Task<AuthResult>? = null
    private val phoneSignIns = mutableListOf<String>()

    private val session = object : FirebaseSession(
        FirebaseAuth.getInstance(demoFirebase()),
        clearCredentials = {},
        signInWithCredential = { phoneSignIns += it.provider; Tasks.forResult(null) },
        pendingBrowserSignIn = { interrupted },
        signInWithProvider = { activity, provider -> pages += activity to provider; page },
    ) {
        override val userId = UID
    }

    private val google = GoogleSignIn(session, "demo-client") { activity, option ->
        sheets += activity to option
        phone()
    }

    private fun signIn(askWhichAccount: Boolean = false) = runBlocking { google.signIn(activity, askWhichAccount) }

    @Test
    fun `a phone without a Google account signs in on Google's page`() {
        assertEquals(SignInOutcome.Succeeded(UID), signIn())

        assertEquals("the sheet was asked for the last account, then for any", 2, sheets.size)
        assertEquals(listOf(GoogleAuthProvider.PROVIDER_ID), pages.map { (it.second as OAuthProvider).providerId })
    }

    @Test
    fun `the sheet and Google's page are both shown over the activity signing in`() {
        signIn()

        assertTrue(sheets.all { it.first === activity })
        assertSame(activity, pages.single().first)
    }

    @Test
    fun `a phone with a Google account signs in with it and never opens Google's page`() {
        phone = { GoogleIdTokenCredential.Builder().setId("parent@example.com").setIdToken(GOOGLE_ID_TOKEN).build() }

        assertEquals(SignInOutcome.Succeeded(UID), signIn())

        assertEquals(listOf(GoogleAuthProvider.PROVIDER_ID), phoneSignIns)
        assertEquals(emptyList<Any>(), pages)
    }

    @Test
    fun `closing the account sheet cancels the sign-in and opens no page`() {
        phone = { throw GetCredentialCancellationException() }

        assertEquals(SignInOutcome.Cancelled, signIn())
        assertEquals(emptyList<Any>(), pages)
    }

    @Test
    fun `closing the tab on Google's page cancels the sign-in`() {
        page = Tasks.forException(FirebaseAuthException("ERROR_WEB_CONTEXT_CANCELED", "The web operation was canceled"))

        assertEquals(SignInOutcome.Cancelled, signIn())
    }

    @Test
    fun `any other failure on Google's page fails the sign-in`() {
        for (failure in listOf(
            FirebaseAuthException("ERROR_WEB_INTERNAL_ERROR", "The web operation failed"),
            FirebaseNetworkException("Google could not be reached"),
        )) {
            page = Tasks.forException(failure)
            val outcome = signIn()
            assertTrue("$failure gave $outcome", outcome is SignInOutcome.Failed)
        }
    }

    @Test
    fun `a sign-in the system stopped the app during is finished first, without the sheet or the page`() {
        interrupted = Tasks.forResult(null)

        assertEquals(SignInOutcome.Succeeded(UID), signIn())

        assertEquals(emptyList<Any>(), sheets)
        assertEquals(emptyList<Any>(), pages)
    }

    @Test
    fun `an interrupted sign-in is finished once, though Firebase still offers it`() {
        interrupted = Tasks.forResult(null)
        signIn()

        signIn()

        assertEquals(1, pages.size)
    }

    @Test
    fun `an interrupted sign-in that failed leaves the sign-in asked for now to go ahead`() {
        interrupted = Tasks.forException(FirebaseAuthException("ERROR_INVALID_CREDENTIAL", "The credential has expired"))

        assertEquals(SignInOutcome.Succeeded(UID), signIn())
        assertEquals(1, pages.size)
    }

    private companion object {
        /** Shaped as Google's: the sheet reads the token, and Firebase, faked here, would check its signature. */
        val GOOGLE_ID_TOKEN = listOf("""{"alg":"RS256"}""", """{"sub":"1","email":"parent@example.com"}""", "signature")
            .joinToString(".") { Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray()) }
    }
}
