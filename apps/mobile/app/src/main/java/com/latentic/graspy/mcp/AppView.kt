package com.latentic.graspy.mcp

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.latentic.graspy.BuildConfig
import com.latentic.graspy.ui.GraspyColor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
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
// A view that has not shown by then is not coming.
private const val SHOW_WITHIN_MS = 20_000L

/**
 * A tool's result as its MCP Apps view, sandboxed on the API's origin, as the web shows it. [waiting] stands over
 * the view until the view has drawn its result: until then the WebView shows nothing.
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
) {
    var failed by remember(card) { mutableStateOf(!LISTENING) }
    var drawn by remember(card) { mutableStateOf(false) }
    val view by produceState<UiView?>(null, card.resourceUri) {
        value = runCatching { server.view(card.resourceUri) }.onFailure {
            Log.w(TAG, "The view ${card.resourceUri} could not be read", it)
            failed = true
        }.getOrNull()
    }
    LaunchedEffect(card) {
        delay(SHOW_WITHIN_MS)
        if (!drawn) failed = true
    }
    if (failed) {
        Text(unavailable, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium, modifier = modifier)
        return
    }
    Box(modifier.fillMaxWidth()) {
        view?.let { document -> HostedFrame(card, document, server, locale, events, onDrawn = { drawn = true }, onGone = { failed = true }) }
        if (!drawn) waiting()
    }
}

@Composable
private fun HostedFrame(card: ViewCard, document: UiView, server: ViewServer, locale: String, events: ViewEvents, onDrawn: () -> Unit, onGone: () -> Unit) {
    var viewHeight by remember(card) { mutableIntStateOf(FIRST_HEIGHT) }
    val uriHandler = LocalUriHandler.current
    val latestEvents by rememberUpdatedState(events)
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
            override fun shown() = latestDrawn()
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
@SuppressLint("SetJavaScriptEnabled")
private class HostedView(
    context: Context,
    card: ViewCard,
    private val view: UiView,
    hostContext: HostContext,
    host: ViewHost,
    onGone: () -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val gate = HostGate(HostPage.ORIGIN, API_ORIGIN)
    private var page: JavaScriptReplyProxy? = null
    private val session = ViewSession(card, view, hostContext, host, ::post)

    val webView = WebView(context).apply {
        tag = this@HostedView
        // Wrapped to its content, a WebView gives the page no height, and the view's frame fills 100% of none.
        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        setBackgroundColor(Color.TRANSPARENT)
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        webViewClient = HostPageClient(context.assets::open, API_ORIGIN, onGone)
    }

    init {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        listen()
    }

    private fun listen() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(webView, LISTENER, setOf(HostPage.ORIGIN)) { _, message, origin, isMainFrame, reply ->
            when (val admitted = gate.admit(origin.toString(), isMainFrame, message.data)) {
                HostMessage.Ready -> {
                    page = reply
                    open()
                }
                is HostMessage.Relay -> scope.launch { session.receive(admitted.data) }
                null -> Log.w(TAG, "Refused a message from $origin")
            }
        }
        webView.loadUrl(HostPage.URL)
    }

    fun close() {
        scope.launch {
            session.teardown()
            webView.destroy()
            scope.cancel()
        }
    }

    private fun open() = toPage(
        buildJsonObject {
            put("kind", "open")
            put("src", HostPage.sandboxAddress(API_ORIGIN, view))
            put("origin", API_ORIGIN)
            put("title", view.title)
        },
    )

    private fun post(message: JsonObject) = toPage(
        buildJsonObject {
            put("kind", "post")
            put("message", message)
        },
    )

    private fun toPage(command: JsonObject) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) page?.postMessage(command.toString())
    }
}

private const val LISTENER = "graspyHost"

/** Without it a view cannot talk to the app, so none is shown. */
private val LISTENING get() = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
private const val TAG = "GraspyView"
