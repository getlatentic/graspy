package com.latentic.graspy.lesson

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.test.junit4.createComposeRule
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.mcp.KeptCallEntity
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.TopicMark
import com.latentic.graspy.settleMain
import com.latentic.graspy.ui.GraspyTheme
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A topic's lesson on screen with the server gone: it opens from the phone's copy, and its view's own lesson
 * calls are answered from that copy, never kept in the outbox as if they recorded the learner's work.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class TopicLessonTest {
    @get:Rule
    val compose = createComposeRule()

    private val database = inMemoryDatabase()
    private val fractionsReady = LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9")))
    private val server = FakeGraspyServer(PLAN, fractionsReady)
    private val connection = LearnerConnection(database, ADA_KEY, OkHttpClient(), server.web.url("/mcp")) { true }

    @After
    fun close() {
        database.close()
        runCatching { server.web.shutdown() }
    }

    @Test
    fun `offline, the lesson opens from its copy and its view's lesson calls answer from it, not the outbox`() {
        val kept = runBlocking { connection.lessons.openOrCopy(topic(1)) }
        server.web.shutdown()
        var shown: ViewCard? = null
        var answered: JsonObject? = null

        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                TopicLesson(
                    learn = learnCopyFor(InterfaceLanguage.ENGLISH),
                    locale = "en",
                    server = connection,
                    lessons = connection.lessons,
                    target = topic(1),
                    onBack = {},
                    onLearnt = {},
                    showView = { card, calls, _ ->
                        shown = card
                        LaunchedEffect(card) { answered = calls.call("lesson_progress", card.toolInput) }
                    },
                )
            }
        }
        settleMain { answered != null }

        assertEquals(kept, shown)
        assertEquals(kept.toolResult, answered)
        assertEquals(emptyList<KeptCallEntity>(), runBlocking { database.keptCallDao().kept(ADA_KEY) })
    }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
    }
}
