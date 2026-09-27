package com.latentic.graspy.mcp

import android.content.Context
import androidx.webkit.JavaScriptReplyProxy
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

// Keeping is a download of every script, style and font of a build: minutes on a slow connection.
private const val KEEP_WITHIN_MS = 180_000L

/**
 * Keeps a sandbox in a WebView no one sees, which loads graspy's host page and frames the sandbox as a view's
 * does: the sandbox's service worker and caches are the WebView's, shared by every view the app shows.
 */
class WebViewSandboxKeeper(private val context: Context) : SandboxKeeper {
    override suspend fun keep(sandbox: String, needed: Set<String>): Boolean {
        if (!LISTENING) return false
        return withContext(Dispatchers.Main) {
            val answer = CompletableDeferred<Boolean>()
            val conversation = SandboxKeep(needed)
            val webView = hostWebView(context) { answer.complete(false) }
            var page: JavaScriptReplyProxy? = null
            webView.listenToHostPage { message, reply ->
                when (message) {
                    HostMessage.Ready -> {
                        page = reply
                        reply.postMessage(openSandbox(sandbox, title = ""))
                    }
                    is HostMessage.Relay -> when (val step = conversation.heard(message.data)) {
                        is SandboxKeep.Step.Ask -> page?.postMessage(toSandbox(step.message))
                        is SandboxKeep.Step.Done -> answer.complete(step.kept)
                        null -> Unit
                    }
                }
            }
            try {
                withTimeoutOrNull(KEEP_WITHIN_MS) { answer.await() } ?: false
            } finally {
                webView.destroy()
            }
        }
    }
}
