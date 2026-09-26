package com.latentic.graspy.ask

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import com.latentic.graspy.mcp.API_ORIGIN
import com.latentic.graspy.mcp.HostPage
import com.latentic.graspy.mcp.HostPageClient
import com.latentic.graspy.mcp.mcpJson
import com.latentic.graspy.mcp.string
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put

/** What the reply page may tell the app. */
sealed interface ReplyMessage {
    data object Ready : ReplyMessage

    data class Height(val px: Int) : ReplyMessage

    data class Open(val href: String) : ReplyMessage
}

private val WEB_LINK = Regex("^https?://.+", RegexOption.IGNORE_CASE)

/** Only the app's own reply page, in its main frame, reaches the app; a link opens only to the web. */
fun replyMessageOf(sourceOrigin: String, isMainFrame: Boolean, message: String?): ReplyMessage? {
    if (!isMainFrame || sourceOrigin.trimEnd('/') != HostPage.ORIGIN || message == null) return null
    val body = runCatching { mcpJson.parseToJsonElement(message) as? JsonObject }.getOrNull() ?: return null
    return when (body.string("kind")) {
        "ready" -> ReplyMessage.Ready
        "height" -> (body["px"] as? JsonPrimitive)?.intOrNull?.takeIf { it >= 0 }?.let(ReplyMessage::Height)
        "open" -> body.string("href")?.takeIf(WEB_LINK::matches)?.let(ReplyMessage::Open)
        else -> null
    }
}

// One line of text is this tall; the page says how tall the reply is once drawn.
private const val FIRST_HEIGHT = 28

/**
 * The tutor's reply drawn as the web draws it, markdown and KaTeX maths included, in a WebView that loads
 * only the app's own page. Without the message listener the reply shows as plain text.
 */
@Composable
fun ReplyView(text: String, modifier: Modifier = Modifier, plain: @Composable () -> Unit) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return plain()
    var height by remember(text) { mutableIntStateOf(FIRST_HEIGHT) }
    val uriHandler = LocalUriHandler.current
    val latestText by rememberUpdatedState(text)
    AndroidView(
        factory = { context -> ReplyPage(context, { latestText }, { height = it }, uriHandler::openUri).webView },
        update = { webView -> (webView.tag as? ReplyPage)?.show(text) },
        onRelease = { webView -> webView.destroy() },
        modifier = modifier.fillMaxWidth().height(height.dp),
    )
}

@SuppressLint("SetJavaScriptEnabled")
private class ReplyPage(context: Context, private val text: () -> String, private val sized: (Int) -> Unit, private val open: (String) -> Unit) {
    private var page: JavaScriptReplyProxy? = null
    private var shown: String? = null

    val webView = WebView(context).apply {
        tag = this@ReplyPage
        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        setBackgroundColor(Color.TRANSPARENT)
        isVerticalScrollBarEnabled = false
        settings.apply {
            javaScriptEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
        }
        webViewClient = HostPageClient(context.assets::open, API_ORIGIN)
    }

    init {
        listen()
    }

    fun show(latest: String) {
        if (latest == shown || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val proxy = page ?: return
        shown = latest
        proxy.postMessage(buildJsonObject { put("text", latest) }.toString())
    }

    private fun listen() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(webView, LISTENER, setOf(HostPage.ORIGIN)) { _, message, origin, isMainFrame, reply ->
            when (val heard = replyMessageOf(origin.toString(), isMainFrame, message.data)) {
                ReplyMessage.Ready -> {
                    page = reply
                    show(text())
                }
                is ReplyMessage.Height -> sized(heard.px)
                is ReplyMessage.Open -> open(heard.href)
                null -> Log.w(TAG, "Refused a message from $origin")
            }
        }
        webView.loadUrl(HostPage.REPLY_URL)
    }

    private companion object {
        const val LISTENER = "graspyReply"
        const val TAG = "GraspyReply"
    }
}
