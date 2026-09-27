package com.latentic.graspy.mcp

import android.content.Context
import android.util.Log
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.webkit.JavaScriptReplyProxy
import com.latentic.graspy.BuildConfig
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.space
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl

/** What a screen does with its view's calls and messages; the rest the host does itself. */
class ViewEvents(
    val toolCalled: (name: String, arguments: JsonObject, result: JsonObject) -> Unit = { _, _, _ -> },
    val message: (text: String) -> Boolean = { false },
)

val API_ORIGIN: String = BuildConfig.API_BASE_URL.toHttpUrl().let { url ->
    url.newBuilder().encodedPath("/").build().toString().removeSuffix("/")
}

// A frame with no area gets no animation frame, and the view measures itself in one: this tall until
// it reports its height.
private const val FIRST_HEIGHT = 192
// As the web's: a view that has not initialised by then is not coming.
private const val SHOW_WITHIN_MS = 20_000L
// Drawing is counted apart, so a phone slow to initialise a view still has the time to draw it.
private const val DRAW_WITHIN_MS = 20_000L
private const val COUNTED_EVERY_MS = 250L

private enum class ViewProgress { Loading, Shown, Drawn }

/** What shows a view's page and tells the screen how it went. */
internal typealias ViewFrame = @Composable (document: UiView, onShown: () -> Unit, onDrawn: () -> Unit, onGone: () -> Unit) -> Unit

/**
 * A tool's result as its MCP Apps view, sandboxed on the API's origin, as the web shows it. [waiting] stands over
 * the view until the view has drawn its result: until then the WebView shows nothing, takes no touch, and has
 * nothing TalkBack reads. A view not initialised after [SHOW_WITHIN_MS] of the app in the foreground, or not drawn
 * [DRAW_WITHIN_MS] after that, could not be shown, and [retry] stands under the notice. Time in the background
 * does not count, since a view cannot draw there.
 */
@Composable
fun AppView(
    card: ViewCard,
    server: ViewServer,
    locale: String,
    unavailable: String,
    modifier: Modifier = Modifier,
    events: ViewEvents = ViewEvents(),
    waiting: @Composable () -> Unit = {},
    retry: @Composable () -> Unit = {},
) = AppView(card, server, unavailable, modifier, waiting, retry, listening = LISTENING) { document, onShown, onDrawn, onGone ->
    HostedFrame(card, document, server, locale, events, onShown, onDrawn, onGone)
}

@Composable
internal fun AppView(
    card: ViewCard,
    server: ViewServer,
    unavailable: String,
    modifier: Modifier,
    waiting: @Composable () -> Unit,
    retry: @Composable () -> Unit,
    listening: Boolean,
    frame: ViewFrame,
) {
    var failed by remember(card) { mutableStateOf(!listening) }
    var progress by remember(card) { mutableStateOf(ViewProgress.Loading) }
    val view by produceState<UiView?>(null, card.resourceUri) {
        value = runCatching { server.view(card.resourceUri) }.onFailure {
            Log.w(TAG, "The view ${card.resourceUri} could not be read", it)
            failed = true
        }.getOrNull()
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(card) {
        val came = lifecycle.inFrontWithin(SHOW_WITHIN_MS) { progress >= ViewProgress.Shown } &&
            lifecycle.inFrontWithin(DRAW_WITHIN_MS) { progress == ViewProgress.Drawn }
        if (!came) failed = true
    }
    if (failed) {
        Column(modifier, verticalArrangement = Arrangement.spacedBy(space(4))) {
            Text(unavailable, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
            retry()
        }
        return
    }
    val drawn = progress == ViewProgress.Drawn
    Box(modifier.fillMaxWidth()) {
        view?.let { document ->
            Box(if (drawn) Modifier else Unreachable) {
                frame(
                    document,
                    { progress = maxOf(progress, ViewProgress.Shown) },
                    { progress = ViewProgress.Drawn },
                    { failed = true },
                )
            }
        }
        if (!drawn) waiting()
    }
}

/** Whether [done] comes within [ms] of the app in the foreground. */
private suspend fun Lifecycle.inFrontWithin(ms: Long, done: () -> Boolean): Boolean {
    var left = ms
    while (!done()) {
        if (left <= 0) return false
        currentStateFlow.first { it.isAtLeast(Lifecycle.State.RESUMED) }
        delay(COUNTED_EVERY_MS)
        if (currentState.isAtLeast(Lifecycle.State.RESUMED)) left -= COUNTED_EVERY_MS
    }
    return true
}

// The waiting card lets touches through, and the view must go on loading under it: the frame refuses everything but
// the rest of a press already refused, so the view never starts a touch, hover or wheel, and a drag still scrolls
// the page around it.
private val Unreachable = Modifier
    .clearAndSetSemantics {}
    .pointerInput(Unit) {
        awaitPointerEventScope {
            while (true) {
                awaitPointerEvent(PointerEventPass.Initial).changes.forEach { if (!it.previousPressed) it.consume() }
            }
        }
    }

@Composable
private fun HostedFrame(
    card: ViewCard,
    document: UiView,
    server: ViewServer,
    locale: String,
    events: ViewEvents,
    onShown: () -> Unit,
    onDrawn: () -> Unit,
    onGone: () -> Unit,
) {
    var viewHeight by remember(card) { mutableIntStateOf(FIRST_HEIGHT) }
    val uriHandler = LocalUriHandler.current
    val latestEvents by rememberUpdatedState(events)
    val latestShown by rememberUpdatedState(onShown)
    val latestDrawn by rememberUpdatedState(onDrawn)
    val host = remember(card) {
        object : ViewHost {
            override suspend fun callTool(name: String, arguments: JsonObject) = server.call(name, arguments)
            override fun toolCalled(name: String, arguments: JsonObject, result: JsonObject) =
                latestEvents.toolCalled(name, arguments, result)
            override fun message(text: String) = latestEvents.message(text)
            override fun openLink(url: String) = uriHandler.openUri(url)
            override fun resize(height: Int) {
                if (height > 0) viewHeight = height
            }
            override fun shown() = latestShown()
            override fun drawn() = latestDrawn()
        }
    }
    AndroidView(
        factory = { context -> HostedView(context, card, document, HostContext(locale), host, onGone).webView },
        onRelease = { webView -> (webView.tag as? HostedView)?.close() },
        modifier = Modifier.fillMaxWidth().height(viewHeight.dp),
    )
}

/**
 * The WebView one view lives in: the host page, the listener only that page can reach, and the view's
 * MCP Apps conversation. Closing asks the view to finish before the WebView goes.
 */
private class HostedView(
    context: Context,
    card: ViewCard,
    private val view: UiView,
    hostContext: HostContext,
    host: ViewHost,
    onGone: () -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var page: JavaScriptReplyProxy? = null
    private val session = ViewSession(card, view, hostContext, host, ::post)

    val webView = hostWebView(context, onGone).apply { tag = this@HostedView }

    init {
        if (LISTENING) webView.listenToHostPage(::heard)
    }

    private fun heard(message: HostMessage, reply: JavaScriptReplyProxy) {
        when (message) {
            HostMessage.Ready -> {
                page = reply
                reply.postMessage(openSandbox(view.sandbox, view.title))
            }
            is HostMessage.Relay -> scope.launch { session.receive(message.data) }
        }
    }

    fun close() {
        scope.launch {
            session.teardown()
            webView.destroy()
            scope.cancel()
        }
    }

    private fun post(message: JsonObject) {
        page?.postMessage(toSandbox(message))
    }
}

private const val TAG = "GraspyView"
