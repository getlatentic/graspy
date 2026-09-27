package com.latentic.graspy.lesson

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.mcp.HOLDS_EVERY_FILE
import com.latentic.graspy.mcp.KeptCallEntity
import com.latentic.graspy.mcp.AppView
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.mcp.UiView
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.ViewServer
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.TopicMark
import com.latentic.graspy.ui.GraspyTheme
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
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
    private val connection = LearnerConnection(database, ADA_KEY, OkHttpClient(), server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }

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
                    showView = { card, calls, _, _ ->
                        shown = card
                        LaunchedEffect(card) { answered = calls.call("lesson_progress", card.toolInput) }
                    },
                )
            }
        }
        compose.waitUntil(TIMEOUT_MS) { answered != null }

        assertEquals(kept, shown)
        assertEquals(kept.toolResult, answered)
        assertEquals(emptyList<KeptCallEntity>(), runBlocking { database.keptCallDao().kept(ADA_KEY) })
    }

    @Test
    fun `a lesson whose view could not be shown opens again on Try again, in a view of its own`() {
        val learn = learnCopyFor(InterfaceLanguage.ENGLISH)
        val attempts = mutableListOf<Int>()
        // The same card every time, given without waiting: a retry that opens the very card that failed.
        val sameCard = object : LessonServer {
            override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard {
                attempts += arguments.getValue("attempt").jsonPrimitive.int
                return lessonCard("making")
            }

            override suspend fun callTool(name: String, arguments: JsonObject): JsonObject = awaitCancellation()

            override suspend fun viewOf(name: String): String = awaitCancellation()

            override suspend fun keepViews() = Unit
        }
        var viewsMade = 0

        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                TopicLesson(
                    learn = learn,
                    locale = "en",
                    server = connection,
                    lessons = OfflineLessons(FakeLessonCopies(), ADA_KEY, sameCard, { true }),
                    target = topic(1),
                    onBack = {},
                    onLearnt = {},
                    showView = { card, _, _, retry ->
                        AppView(card, ReadyView, learn.chat.viewUnavailable, Modifier, waiting = {}, retry = retry, listening = true) { _, _, _, onGone ->
                            val first = remember { ++viewsMade == 1 }
                            LaunchedEffect(Unit) { if (first) onGone() }
                        }
                    },
                )
            }
        }
        compose.onNodeWithText(learn.chat.viewUnavailable).assertExists()

        compose.onNodeWithText(learn.lesson.tryAgain).performClick()
        compose.waitForIdle()

        assertEquals(listOf(0, 1), attempts)
        assertEquals(2, viewsMade)
        compose.onNodeWithText(learn.chat.viewUnavailable).assertDoesNotExist()
    }

    private object ReadyView : ViewServer {
        override suspend fun view(uri: String) = UiView("<html></html>", "Lesson", sandbox = "/ui-sandbox/0123456789abcdef/", csp = null, permissions = null)

        override suspend fun call(name: String, arguments: JsonObject): JsonObject = awaitCancellation()

        override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = awaitCancellation()
    }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
        const val TIMEOUT_MS = 10_000L
    }
}
