package com.latentic.graspy.mcp

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.awaitCancellation
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A view stands behind its waiting card, out of reach, until it has drawn. It has twenty seconds the app is in
 * front to initialise, then twenty more to draw.
 */
@RunWith(RobolectricTestRunner::class)
class AppViewTest {
    @get:Rule
    val compose = createComposeRule()

    private val card = ViewCard("ui://graspy/lesson", "give_lesson", JsonObject(emptyMap()), JsonObject(emptyMap()))
    private val app = object : LifecycleOwner {
        val registry = LifecycleRegistry(this)
        override val lifecycle get() = registry
    }
    private var shown: (() -> Unit)? = null
    private var drawn: (() -> Unit)? = null
    private var framesMade = 0
    private var taps = 0

    @Before
    fun open() {
        compose.mainClock.autoAdvance = false
        compose.runOnUiThread { app.registry.currentState = Lifecycle.State.RESUMED }
        compose.setContent {
            CompositionLocalProvider(LocalLifecycleOwner provides app) {
                AppView(card, Server, UNAVAILABLE, Modifier, waiting = { Text(WAITING) }, retry = { Text(RETRY) }, listening = true) { _, onShown, onDrawn, _ ->
                    LaunchedEffect(Unit) { framesMade += 1 }
                    shown = onShown
                    drawn = onDrawn
                    Box(Modifier.fillMaxWidth().height(192.dp).pointerInput(Unit) { detectTapGestures { taps += 1 } }) { Text(FRAME) }
                }
            }
        }
        while (drawn == null) compose.mainClock.advanceTimeByFrame()
    }

    @Test
    fun `the waiting card stays until the view has drawn, then goes`() {
        compose.onNodeWithText(WAITING).assertExists()

        compose.runOnIdle { shown!!() }
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithText(WAITING).assertExists()

        compose.runOnIdle { drawn!!() }
        compose.mainClock.advanceTimeBy(1_000)

        compose.onNodeWithText(WAITING).assertDoesNotExist()
        compose.onNodeWithText(UNAVAILABLE).assertDoesNotExist()
    }

    @Test
    fun `a view not yet drawn takes no touch and is hidden from TalkBack, and loads on in the same frame`() {
        compose.onNodeWithText(FRAME).assertDoesNotExist()
        compose.onRoot().performTouchInput { click() }
        compose.mainClock.advanceTimeBy(1_000)
        assertEquals(0, taps)

        compose.runOnIdle {
            shown!!()
            drawn!!()
        }
        compose.mainClock.advanceTimeBy(1_000)

        compose.onNodeWithText(FRAME).assertExists()
        compose.onRoot().performTouchInput { click() }
        compose.mainClock.advanceTimeBy(1_000)
        assertEquals(1, taps)
        assertEquals(1, framesMade)
    }

    @Test
    fun `a view initialised late still has twenty seconds in front to draw`() {
        compose.mainClock.advanceTimeBy(19_000)
        compose.runOnIdle { shown!!() }

        compose.mainClock.advanceTimeBy(19_000)
        compose.onNodeWithText(WAITING).assertExists()

        compose.mainClock.advanceTimeBy(2_000)
        compose.onNodeWithText(UNAVAILABLE).assertExists()
        compose.onNodeWithText(RETRY).assertExists()
    }

    @Test
    fun `drawing too counts only time the app is in front`() {
        compose.runOnIdle { shown!!() }
        compose.mainClock.advanceTimeBy(15_000)
        compose.runOnUiThread { app.registry.currentState = Lifecycle.State.CREATED }
        compose.mainClock.advanceTimeBy(60_000)
        compose.runOnUiThread { app.registry.currentState = Lifecycle.State.RESUMED }
        compose.mainClock.advanceTimeBy(2_000)
        compose.onNodeWithText(WAITING).assertExists()

        compose.mainClock.advanceTimeBy(4_000)
        compose.onNodeWithText(UNAVAILABLE).assertExists()
    }

    @Test
    fun `a view that never initialises is given up on after twenty seconds in front`() {
        compose.mainClock.advanceTimeBy(19_000)
        compose.onNodeWithText(WAITING).assertExists()

        compose.mainClock.advanceTimeBy(2_000)
        compose.onNodeWithText(UNAVAILABLE).assertExists()
    }

    @Test
    fun `time with the app in the background does not count`() {
        compose.mainClock.advanceTimeBy(15_000)
        compose.runOnUiThread { app.registry.currentState = Lifecycle.State.CREATED }
        compose.mainClock.advanceTimeBy(60_000)
        compose.runOnUiThread { app.registry.currentState = Lifecycle.State.RESUMED }
        compose.mainClock.advanceTimeBy(2_000)
        compose.onNodeWithText(WAITING).assertExists()

        compose.mainClock.advanceTimeBy(4_000)
        compose.onNodeWithText(UNAVAILABLE).assertExists()
    }

    private object Server : ViewServer {
        override suspend fun view(uri: String) = UiView("<html></html>", "Lesson", csp = null, permissions = null)

        override suspend fun keepShown(uri: String, view: UiView) = Unit

        override suspend fun call(name: String, arguments: JsonObject): JsonObject = awaitCancellation()

        override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = awaitCancellation()
    }

    private companion object {
        const val WAITING = "Preparing your lesson"
        const val UNAVAILABLE = "This card could not be shown."
        const val RETRY = "Try again"
        const val FRAME = "The lesson"
    }
}
