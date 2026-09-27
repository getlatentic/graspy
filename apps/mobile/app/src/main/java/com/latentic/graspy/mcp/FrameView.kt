package com.latentic.graspy.mcp

import android.content.Context
import android.view.View
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.viewinterop.AndroidView

/**
 * The view a tool's result is drawn in. Until [reachable], it stands out of reach under the waiting card while it
 * goes on loading: it starts no touch, takes no mouse button, wheel, hover or key focus, and TalkBack sees nothing of
 * it. A drag started on it still scrolls the page around it. Its one pointer handler stays for its whole life, so a
 * gesture under way as it becomes reachable ends as it began, and the next reaches it.
 */
@Composable
internal fun <T : View> FrameView(
    factory: (Context) -> T,
    reachable: Boolean,
    modifier: Modifier = Modifier,
    onRelease: (T) -> Unit = {},
) {
    val latest by rememberUpdatedState(reachable)
    // Cleared on a node around the view: Compose leaves out of the accessibility tree an embedded view whose own node
    // is inside cleared semantics, but not one whose own node is cleared.
    Box(modifier.then(if (reachable) Modifier else Modifier.clearAndSetSemantics {}), propagateMinConstraints = true) {
        AndroidView(
            factory = factory,
            modifier = Modifier.pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (!latest) event.changes.forEach { if (!it.previousPressed) it.consume() }
                    }
                }
            },
            onRelease = onRelease,
            update = { view -> view.reachable(reachable) },
        )
    }
}

// Compose hands a mouse button's press, a wheel and TalkBack's explore-by-touch hover to an embedded view past any
// pointer handler, so the view itself refuses them.
private val REFUSED_MOTION = View.OnGenericMotionListener { _, _ -> true }
private val REFUSED_HOVER = View.OnHoverListener { _, _ -> true }

internal fun View.reachable(reachable: Boolean) {
    setOnGenericMotionListener(if (reachable) null else REFUSED_MOTION)
    setOnHoverListener(if (reachable) null else REFUSED_HOVER)
    importantForAccessibility =
        if (reachable) View.IMPORTANT_FOR_ACCESSIBILITY_AUTO else View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    isFocusable = reachable
    isFocusableInTouchMode = reachable
    if (!reachable) clearFocus()
}
