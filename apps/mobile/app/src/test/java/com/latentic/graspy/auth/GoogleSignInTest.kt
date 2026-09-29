package com.latentic.graspy.auth

import android.app.Activity
import androidx.credentials.Credential
import androidx.credentials.CredentialOption
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FederatedAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
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
import org.robolectric.Shadows.shadowOf

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

    private val phoneSignIns = mutableListOf<String>()

    /** Signing the current user in again, in place of signing a user in: through the phone's account and on Google's page. */
    private val phoneReauths = mutableListOf<String>()
    private val pageReauths = mutableListOf<Pair<Activity, FederatedAuthProvider>>()
    private var reauth: Task<Void> = Tasks.forResult(null)
    private var pageReauth: Task<AuthResult> = Tasks.forResult(null)

    private val session = object : FirebaseSession(
        FirebaseAuth.getInstance(demoFirebase()),
        clearCredentials = {},
        signInWithCredential = { phoneSignIns += it.provider; Tasks.forResult(null) },
        signInWithProvider = { activity, provider -> pages += activity to provider; page },
        reauthenticateWithCredential = { phoneReauths += it.provider; reauth },
        reauthenticateWithProvider = { activity, provider -> pageReauths += activity to provider; pageReauth },
    ) {
        override val userId = UID
    }

    private val google = GoogleSignIn(session, "demo-client") { activity, option ->
        sheets += activity to option
        phone()
    }

    private fun signIn(askWhichAccount: Boolean = false) = runBlocking { google.signIn(activity, askWhichAccount) }

    private fun reconfirm() = runBlocking { google.reconfirm(activity) }

    private fun googleAccount(): Credential =
        GoogleIdTokenCredential.Builder().setId("parent@example.com").setIdToken(GOOGLE_ID_TOKEN).build()

    @Test
    fun `a phone without a Google account signs in on Google's page`() {
        assertEquals(SignInOutcome.Succeeded(UID), signIn())

        assertEquals("the sheet was asked for the last account, then for any", 2, sheets.size)
        assertEquals(listOf(GoogleAuthProvider.PROVIDER_ID), pages.map { (it.second as OAuthProvider).providerId })
    }

    @Test
    fun `a phone with no Credential Manager to offer an account signs in on Google's page`() {
        for (missing in listOf(GetCredentialProviderConfigurationException(), GetCredentialUnsupportedException())) {
            pages.clear()
            phone = { throw missing }

            assertEquals(SignInOutcome.Succeeded(UID), signIn())
            assertEquals(missing.toString(), 1, pages.size)
        }
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
    fun `Google's page asks which account rather than taking the one Chrome is signed in to`() {
        val auth = FirebaseAuth.getInstance(demoFirebase())
        val opened = FirebaseSession(auth, signInWithProvider = { activity, provider ->
            auth.startActivityForSignInWithProvider(activity, provider)
            Tasks.forResult(null)
        })

        runBlocking { opened.signInInBrowser(activity) }

        val page = shadowOf(activity).nextStartedActivity
        assertEquals("select_account", page.getBundleExtra(CUSTOM_PARAMETERS)?.getString("prompt"))
    }

    @Test
    fun `confirming signs the current user in again with the phone's account, and signs no user in`() {
        phone = { googleAccount() }

        assertEquals(SignInOutcome.Succeeded(UID), reconfirm())

        assertEquals(listOf(GoogleAuthProvider.PROVIDER_ID), phoneReauths)
        assertEquals(emptyList<String>(), phoneSignIns)
        assertEquals(emptyList<Any>(), pages + pageReauths)
    }

    @Test
    fun `confirming always asks which account, and never takes the last one unasked`() {
        phone = { googleAccount() }

        reconfirm()

        val option = sheets.single().second as GetGoogleIdOption
        assertEquals(false, option.filterByAuthorizedAccounts)
        assertEquals(false, option.autoSelectEnabled)
        assertSame(activity, sheets.single().first)
    }

    @Test
    fun `confirming on a phone without a Google account uses Google's page, to sign the user in again`() {
        assertEquals(SignInOutcome.Succeeded(UID), reconfirm())

        assertEquals(listOf(GoogleAuthProvider.PROVIDER_ID), pageReauths.map { (it.second as OAuthProvider).providerId })
        assertSame(activity, pageReauths.single().first)
        assertEquals(emptyList<Any>(), pages)
    }

    @Test
    fun `a Google account that is not the signed-in user's is not confirmed, on the phone or on Google's page`() {
        val mismatch = FirebaseAuthInvalidCredentialsException("ERROR_USER_MISMATCH", "The credential is not this user's")
        phone = { googleAccount() }
        reauth = Tasks.forException(mismatch)
        assertEquals(SignInOutcome.OtherAccount, reconfirm())

        phone = { throw NoCredentialException() }
        pageReauth = Tasks.forException(mismatch)
        assertEquals(SignInOutcome.OtherAccount, reconfirm())
    }

    @Test
    fun `closing the sheet or Google's page while confirming cancels it, and any other failure fails it`() {
        phone = { throw GetCredentialCancellationException() }
        assertEquals(SignInOutcome.Cancelled, reconfirm())

        phone = { throw NoCredentialException() }
        pageReauth = Tasks.forException(FirebaseAuthException("ERROR_WEB_CONTEXT_CANCELED", "The web operation was canceled"))
        assertEquals(SignInOutcome.Cancelled, reconfirm())

        pageReauth = Tasks.forException(FirebaseNetworkException("Google could not be reached"))
        assertTrue(reconfirm() is SignInOutcome.Failed)
    }

    private companion object {
        // The extra Firebase hands Google's page its parameters in.
        const val CUSTOM_PARAMETERS = "com.google.firebase.auth.KEY_PROVIDER_CUSTOM_PARAMS"

        /** Shaped as Google's: the sheet reads the token, and Firebase, faked here, would check its signature. */
        val GOOGLE_ID_TOKEN = listOf("""{"alg":"RS256"}""", """{"sub":"1","email":"parent@example.com"}""", "signature")
            .joinToString(".") { Base64.getUrlEncoder().withoutPadding().encodeToString(it.toByteArray()) }
    }
}
