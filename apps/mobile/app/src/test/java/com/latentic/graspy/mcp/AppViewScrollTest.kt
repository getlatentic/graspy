package com.latentic.graspy.mcp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.performMouseInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.awaitCancellation
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A view not yet drawn takes no touch of its own, but a drag over it still scrolls the page it is on. */
@RunWith(RobolectricTestRunner::class)
class AppViewScrollTest {
    @get:Rule
    val compose = createComposeRule()

    private val card = ViewCard("ui://graspy/lesson", "give_lesson", JsonObject(emptyMap()), JsonObject(emptyMap()))

    @Test
    fun `a drag over a view not yet drawn scrolls the page, and the view feels none of it`() {
        val scroll = ScrollState(0)
        lateinit var framed: RecordingView
        compose.setContent {
            Column(Modifier.testTag(PAGE).verticalScroll(scroll)) {
                AppView(card, Server, "unavailable", Modifier, waiting = {}, retry = {}, listening = true) { _, reachable, _, _, _ ->
                    FrameView({ RecordingView(it).also { view -> framed = view } }, reachable, Modifier.testTag(VIEW).fillMaxWidth().height(400.dp))
                }
                Spacer(Modifier.height(2_000.dp))
            }
        }
        compose.waitForIdle()

        compose.onNodeWithTag(VIEW, useUnmergedTree = true).performTouchInput { swipeUp() }
        compose.waitForIdle()

        assertTrue("the page did not scroll", scroll.value > 0)
        assertEquals(emptyList<Int>(), framed.touches)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun `a mouse moved, scrolled and clicked over a view not yet drawn reaches none of it`() {
        lateinit var framed: RecordingView
        compose.setContent {
            AppView(card, Server, "unavailable", Modifier, waiting = {}, retry = {}, listening = true) { _, reachable, _, _, _ ->
                FrameView({ RecordingView(it).also { view -> framed = view } }, reachable, Modifier.testTag(VIEW).fillMaxWidth().height(400.dp))
            }
        }
        compose.waitForIdle()

        compose.onNodeWithTag(VIEW, useUnmergedTree = true).performMouseInput {
            moveTo(center)
            scroll(3f)
            press()
            release()
        }
        compose.waitForIdle()

        assertEquals(emptyList<Int>(), framed.touches + framed.generic + framed.hovers)
    }

    private object Server : ViewServer {
        override suspend fun view(uri: String) = UiView("<html></html>", "Lesson", csp = null, permissions = null)

        override suspend fun keepShown(uri: String, view: UiView) = Unit

        override suspend fun call(name: String, arguments: JsonObject): JsonObject = awaitCancellation()

        override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = awaitCancellation()
    }

    private companion object {
        const val PAGE = "page"
        const val VIEW = "view"
    }
}
