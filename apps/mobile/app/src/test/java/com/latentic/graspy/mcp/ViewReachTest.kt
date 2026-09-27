package com.latentic.graspy.mcp

import android.os.SystemClock
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityNodeProvider
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.awaitCancellation
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A view still loading is out of every reach under its waiting card: no touch starts on it, no mouse button, wheel,
 * hover or key focus gets to it, and TalkBack sees nothing of it. Once drawn, all of them reach it, the first tap
 * after it draws included, and it is the same view all along.
 */
@RunWith(RobolectricTestRunner::class)
class ViewReachTest {
    @get:Rule
    val compose = createComposeRule()

    private val card = ViewCard("ui://graspy/lesson", "give_lesson", JsonObject(emptyMap()), JsonObject(emptyMap()))
    private val app = object : LifecycleOwner {
        val registry = LifecycleRegistry(this)
        override val lifecycle get() = registry
    }
    private var draw: (() -> Unit)? = null
    private lateinit var root: View
    private val made = mutableListOf<RecordingView>()
    private val framed get() = made.single()

    @Before
    fun open() {
        compose.mainClock.autoAdvance = false
        compose.runOnUiThread { app.registry.currentState = Lifecycle.State.RESUMED }
        compose.setContent {
            root = LocalView.current
            CompositionLocalProvider(LocalLifecycleOwner provides app) {
                AppView(card, Server, UNAVAILABLE, Modifier, waiting = { Text(WAITING) }, retry = {}, listening = true) { _, reachable, onShown, onDrawn, _ ->
                    draw = {
                        onShown()
                        onDrawn()
                    }
                    FrameView({ RecordingView(it).also(made::add) }, reachable, Modifier.testTag(VIEW).fillMaxWidth().height(192.dp))
                }
            }
        }
        while (draw == null) compose.mainClock.advanceTimeByFrame()
        settle()
    }

    private fun settle() = compose.mainClock.advanceTimeBy(100)

    private fun drawn() {
        compose.runOnIdle { draw!!() }
        compose.mainClock.advanceTimeBy(1_000)
    }

    private fun at(time: Long, action: Int, source: Int, tool: Int, buttons: Int = 0): MotionEvent {
        val properties = arrayOf(MotionEvent.PointerProperties().apply { id = 0; toolType = tool })
        val coords = arrayOf(MotionEvent.PointerCoords().apply { x = 50f; y = 50f })
        return MotionEvent.obtain(time, SystemClock.uptimeMillis(), action, 1, properties, coords, 0, buttons, 1f, 1f, 0, 0, source, 0)
    }

    private fun mouse(action: Int, buttons: Int = 0, down: Long = SystemClock.uptimeMillis()) =
        at(down, action, InputDevice.SOURCE_MOUSE, MotionEvent.TOOL_TYPE_MOUSE, buttons)

    private fun finger(action: Int, down: Long) = at(down, action, InputDevice.SOURCE_TOUCHSCREEN, MotionEvent.TOOL_TYPE_FINGER)

    private fun click() {
        val down = SystemClock.uptimeMillis()
        compose.runOnIdle {
            root.dispatchTouchEvent(mouse(MotionEvent.ACTION_DOWN, MotionEvent.BUTTON_PRIMARY, down))
            root.dispatchGenericMotionEvent(mouse(MotionEvent.ACTION_BUTTON_PRESS, MotionEvent.BUTTON_PRIMARY, down))
            root.dispatchGenericMotionEvent(mouse(MotionEvent.ACTION_BUTTON_RELEASE, down = down))
            root.dispatchTouchEvent(mouse(MotionEvent.ACTION_UP, down = down))
        }
        settle()
    }

    private fun tap() {
        val down = SystemClock.uptimeMillis()
        compose.runOnIdle {
            root.dispatchTouchEvent(finger(MotionEvent.ACTION_DOWN, down))
            root.dispatchTouchEvent(finger(MotionEvent.ACTION_UP, down))
        }
        settle()
    }

    @Test
    fun `a mouse click on a view still loading reaches none of it, button presses included`() {
        click()

        assertEquals(emptyList<Int>(), framed.touches)
        assertEquals(emptyList<Int>(), framed.generic)
    }

    @Test
    fun `a mouse click on a drawn view reaches it`() {
        drawn()
        click()

        assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP), framed.touches)
        assertEquals(listOf(MotionEvent.ACTION_BUTTON_PRESS, MotionEvent.ACTION_BUTTON_RELEASE), framed.generic)
    }

    @Test
    fun `a view still loading refuses hover and the wheel itself, as TalkBack's explore-by-touch hands them past Compose`() {
        compose.runOnIdle {
            framed.dispatchGenericMotionEvent(mouse(MotionEvent.ACTION_HOVER_ENTER))
            framed.dispatchGenericMotionEvent(mouse(MotionEvent.ACTION_HOVER_MOVE))
            framed.dispatchGenericMotionEvent(mouse(MotionEvent.ACTION_SCROLL))
        }
        assertEquals(emptyList<Int>(), framed.hovers)
        assertEquals(emptyList<Int>(), framed.generic)

        drawn()
        compose.runOnIdle {
            framed.dispatchGenericMotionEvent(mouse(MotionEvent.ACTION_HOVER_ENTER))
            framed.dispatchGenericMotionEvent(mouse(MotionEvent.ACTION_SCROLL))
        }
        assertEquals(listOf(MotionEvent.ACTION_HOVER_ENTER), framed.hovers)
        assertEquals(listOf(MotionEvent.ACTION_SCROLL), framed.generic)
    }

    @Test
    fun `TalkBack sees nothing of a view still loading, and all of it once drawn`() {
        compose.runOnIdle {
            assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS, framed.importantForAccessibility)
        }
        assertFalse(viewInAccessibilityTree())

        drawn()

        compose.runOnIdle { assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO, framed.importantForAccessibility) }
        assertTrue(viewInAccessibilityTree())
    }

    /** Whether the accessibility tree TalkBack walks, from the root down, reaches the embedded view. */
    private fun viewInAccessibilityTree(): Boolean = compose.runOnIdle {
        // The ids a node gives its children are hidden API: the view's id, and in the upper half a virtual node's.
        val childId = AccessibilityNodeInfo::class.java.getDeclaredMethod("getChildId", Int::class.javaPrimitiveType)
        val viewId = View::class.java.getDeclaredMethod("getAccessibilityViewId").apply { isAccessible = true }
        val holder = viewId.invoke(framed.parent) as Int
        val host = viewId.invoke(root) as Int
        val provider = root.accessibilityNodeProvider
        fun reaches(virtual: Int): Boolean {
            val info = provider.createAccessibilityNodeInfo(virtual) ?: return false
            return (0 until info.childCount).any { index ->
                val child = childId.invoke(info, index) as Long
                when (child.toInt()) {
                    holder -> true
                    host -> reaches((child ushr 32).toInt())
                    else -> false
                }
            }
        }
        reaches(AccessibilityNodeProvider.HOST_VIEW_ID)
    }

    @Test
    fun `a view still loading takes no key focus, and takes it once drawn`() {
        compose.runOnIdle { assertFalse(framed.requestFocus()) }

        drawn()

        compose.runOnIdle { assertTrue(framed.requestFocus()) }
    }

    @Test
    fun `a touch on a view still loading reaches none of it, and a tap once drawn does, on the same view`() {
        tap()
        assertEquals(emptyList<Int>(), framed.touches)

        drawn()
        tap()

        assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP), framed.touches)
        assertEquals(1, made.size)
    }

    @Test
    fun `the first tap after a view draws mid-gesture reaches it`() {
        val down = SystemClock.uptimeMillis()
        compose.runOnIdle { root.dispatchTouchEvent(finger(MotionEvent.ACTION_DOWN, down)) }
        settle()
        drawn()
        compose.runOnIdle { root.dispatchTouchEvent(finger(MotionEvent.ACTION_UP, down)) }
        settle()

        tap()

        assertEquals(listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP), framed.touches.takeLast(2))
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
        const val VIEW = "view"
    }
}
