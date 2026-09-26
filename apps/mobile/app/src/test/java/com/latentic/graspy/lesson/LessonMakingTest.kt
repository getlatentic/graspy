package com.latentic.graspy.lesson

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.webkit.WebViewFeature
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.UiView
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.ViewServer
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.ui.GraspyTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements

/** From the tap to the lesson's first slide, the screen always says the lesson is being prepared. */
@RunWith(RobolectricTestRunner::class)
// A WebView that can carry a view's messages, as every phone graspy supports has.
@Config(qualifiers = "w412dp-h915dp-xxhdpi", shadows = [ListeningWebView::class], instrumentedPackages = ["androidx.webkit"])
class LessonMakingTest {
    @get:Rule
    val compose = createComposeRule()

    private val learn = learnCopyFor(InterfaceLanguage.ENGLISH)
    private val target = LessonTarget("plan-1", "mathematics", "Mathematics", 0, "Place value", 20, "US", "en", "Grade 3")
    private val card = ViewCard("ui://graspy/lesson", "give_lesson", JsonObject(emptyMap()), buildJsonObject { put("isError", false) })

    @Test
    fun `while the lesson is asked for, it is being prepared`() {
        show(Server(opened = CompletableDeferred()))

        preparing()
    }

    @Test
    fun `while its view loads, the lesson is still being prepared`() {
        show(Server(opened = CompletableDeferred(card)))

        preparing()
    }

    private fun show(server: Server) {
        val lessons = OfflineLessons(inMemoryDatabase().lessonCopyDao(), "uid/ada", server, stillLearning = { true })
        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                TopicLesson(learn, "en", server, lessons, target, onBack = {}, onLearnt = {})
            }
        }
        compose.waitForIdle()
    }

    private fun preparing() {
        compose.onNodeWithText(learn.lesson.loading).assertIsDisplayed()
        compose.onNodeWithText(target.topic).assertIsDisplayed()
    }

    /** A server whose lesson opens with [opened] and whose view never finishes loading. */
    private class Server(private val opened: CompletableDeferred<ViewCard>) : ViewServer, LessonServer {
        override suspend fun view(uri: String): UiView = awaitCancellation()

        override suspend fun keepShown(uri: String, view: UiView) = Unit

        override suspend fun call(name: String, arguments: JsonObject): JsonObject = awaitCancellation()

        override suspend fun callTool(name: String, arguments: JsonObject): JsonObject = awaitCancellation()

        override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = opened.await()

        override suspend fun viewOf(name: String): String = card.resourceUri

        override suspend fun keepViews() = Unit

        private val card = ViewCard("ui://graspy/lesson", "give_lesson", JsonObject(emptyMap()), JsonObject(emptyMap()))
    }
}

@Implements(WebViewFeature::class)
class ListeningWebView {
    companion object {
        @JvmStatic
        @Implementation
        fun isFeatureSupported(feature: String): Boolean = feature == WebViewFeature.WEB_MESSAGE_LISTENER
    }
}
