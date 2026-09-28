package com.latentic.graspy.auth

import androidx.credentials.CredentialOption
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Told to ask which account, the sheet never signs the last Google account in unasked. */
@RunWith(RobolectricTestRunner::class)
class SignInOptionsTest {
    private fun signsAnAccountInUnasked(options: List<CredentialOption>) =
        options.filterIsInstance<GetGoogleIdOption>().any { it.autoSelectEnabled }

    @Test
    fun `the sheet may sign the last account in unasked`() {
        assertTrue(signsAnAccountInUnasked(signInOptions("demo-client", askWhichAccount = false)))
    }

    @Test
    fun `asked which account, the sheet still offers accounts but signs none in unasked`() {
        val options = signInOptions("demo-client", askWhichAccount = true)

        assertTrue(options.isNotEmpty())
        assertFalse(signsAnAccountInUnasked(options))
    }

    @Test
    fun `the sheet only offers the phone's accounts, and never adds one to the phone`() {
        for (askWhichAccount in listOf(false, true)) {
            val options = signInOptions("demo-client", askWhichAccount)

            assertFalse(options.any { it is GetSignInWithGoogleOption })
            assertTrue(options.all { it is GetGoogleIdOption })
        }
    }
}
