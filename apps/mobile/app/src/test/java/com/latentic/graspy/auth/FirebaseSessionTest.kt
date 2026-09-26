package com.latentic.graspy.auth

import com.google.android.gms.tasks.TaskCompletionSource
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.latentic.graspy.account.demoFirebase
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FirebaseSessionTest {
    @Test
    fun `a sign-in its caller leaves is waited out, so none completes after the caller has signed it out`() = runBlocking {
        val firebaseSignIn = TaskCompletionSource<AuthResult>()
        val session = FirebaseSession(FirebaseAuth.getInstance(demoFirebase()), signInWithCredential = { firebaseSignIn.task })
        val asked = CompletableDeferred<Unit>()
        val signingIn = launch(Dispatchers.Default) {
            asked.complete(Unit)
            session.signInWithGoogle("google-id-token")
        }
        asked.await()

        signingIn.cancel()
        delay(100)
        assertFalse("the caller went on while Firebase was still signing in", signingIn.isCompleted)

        firebaseSignIn.setResult(null)
        signingIn.join()
        assertTrue(signingIn.isCancelled)
    }
}
