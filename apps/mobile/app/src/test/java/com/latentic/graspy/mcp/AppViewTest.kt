package com.latentic.graspy.mcp

import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.awaitCancellation
import kotlinx.serialization.json.JsonObject
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A view stands behind its waiting card until it has drawn. It has twenty seconds the app is in
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

    @Before
    fun open() {
        compose.mainClock.autoAdvance = false
        compose.runOnUiThread { app.registry.currentState = Lifecycle.State.RESUMED }
        compose.setContent {
            CompositionLocalProvider(LocalLifecycleOwner provides app) {
                AppView(card, Server, UNAVAILABLE, Modifier, waiting = { Text(WAITING) }, retry = { Text(RETRY) }, listening = true) { _, onShown, onDrawn, _ ->
                    shown = onShown
                    drawn = onDrawn
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
    }
}
