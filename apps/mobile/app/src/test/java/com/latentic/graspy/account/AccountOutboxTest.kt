package com.latentic.graspy.account

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkManager
import com.latentic.graspy.ask.ChatThreadEntity
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.mcp.KeptCallEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The outbox sign-out and a learner switch send first, wired as the app wires it. No call leaves the test: with
 * nobody learning as the learner, their requests are refused before they are sent.
 */
@RunWith(RobolectricTestRunner::class)
class AccountOutboxTest {
    private val application: Application = ApplicationProvider.getApplicationContext()

    @Before
    fun nobodyLearning() {
        demoFirebase()
        if (!WorkManager.isInitialized()) WorkManager.initialize(application, Configuration.Builder().setExecutor { it.run() }.build())
        AppGraph.account(application).accounts.set(null)
    }

    @After
    fun wipe() = runBlocking {
        withContext(Dispatchers.IO) { AppGraph.database(application).clearAllTables() }
    }

    @Test
    fun `a view's call still on the device counts as unsent`() = runBlocking {
        val outbox = AppGraph.account(application).outbox
        assertTrue(outbox.flush(ADA_KEY))

        AppGraph.database(application).keptCallDao().keep(KeptCallEntity(ownerId = ADA_KEY, name = "answer_check", argumentsJson = "{}", keptAt = 1L))

        assertFalse(outbox.flush(ADA_KEY))
    }

    @Test
    fun `a conversation still on the device only counts as unsent`() = runBlocking {
        val outbox = AppGraph.account(application).outbox
        assertTrue(outbox.flush(ADA_KEY))

        AppGraph.database(application).chatDao().saveThread(
            ChatThreadEntity(ADA_KEY, "thread-1", "general\u0000plan-1", """{"kind":"general","planId":"plan-1"}""", null, "Hi?", 1, 1),
        )

        assertFalse(outbox.flush(ADA_KEY))
    }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
    }
}
