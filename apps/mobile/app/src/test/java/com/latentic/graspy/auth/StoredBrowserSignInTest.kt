package com.latentic.graspy.auth

import androidx.core.content.edit
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.latentic.graspy.account.context
import com.latentic.graspy.account.demoFirebase
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** What Google's page returns to a graspy Android stopped behind it never signs anyone in at a later start. */
@RunWith(RobolectricTestRunner::class)
class StoredBrowserSignInTest {
    @Test
    fun `dropped at start, it gives Firebase nothing to sign in`() {
        storeAsFirebaseDoes()
        dropStoredBrowserSignIn(context())
        assertNull(nextStart().pendingAuthResult)

        // Firebase keeps what it read for the life of the process, so the one it signs in is read last.
        storeAsFirebaseDoes()
        assertNotNull("left in place, Firebase signs it in by itself", nextStart().pendingAuthResult)
    }

    private fun storeAsFirebaseDoes() = context().getSharedPreferences(FIREBASE_STORED_SIGN_IN, 0).edit(commit = true) {
        putString("firebaseAppName", FirebaseApp.DEFAULT_APP_NAME)
        putString("operation", "com.google.firebase.auth.internal.NONGMSCORE_SIGN_IN")
        putString("verifyAssertionRequest", GOOGLE_PAGE_RESULT)
        putLong("timestamp", System.currentTimeMillis())
    }

    /** Firebase Auth reads what it stored as it is built, so each start is a new Firebase app. */
    private fun nextStart(): FirebaseAuth {
        FirebaseApp.getApps(context()).forEach { it.delete() }
        return FirebaseAuth.getInstance(demoFirebase())
    }

    private companion object {
        /** An empty sign-in request, as Firebase writes one under Robolectric. */
        const val GOOGLE_PAGE_RESULT =
            "rO0ABXcIAAAACAAAAARzcgARamF2YS5sYW5nLkludGVnZXIS4qCk94GHOAIAAUkABXZhbHVleHIAEGphdmEubGFuZy5OdW1iZXKGrJUd" +
                "C5TgiwIAAHhw__9PRXcEAAAABHNxAH4AAAAAABh3BAAAAARzcQB-AAAABAAKdwQAAAAEc3EAfgAAAAAAAXcEAAAABHNxAH4AAAAE" +
                "AAt3BAAAAARxAH4ABXcEAAAABHNxAH4AAAAEABB3BAAAAARzcQB-AAAAAAAA"
    }
}
