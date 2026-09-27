package com.latentic.graspy.mcp

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.latentic.graspy.BuildConfig
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private const val LISTENER = "graspyHost"
private const val TAG = "GraspyHostPage"

/** Without it a sandbox cannot talk to the app, so none is opened. */
internal val LISTENING get() = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)

/** A WebView for graspy's host page, which frames a sandbox on the API's origin and nothing else. */
@SuppressLint("SetJavaScriptEnabled")
internal fun hostWebView(context: Context, onGone: () -> Unit): WebView = WebView(context).apply {
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
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
}

/** Loads the host page and passes on what it admits: only the page itself, relaying the sandbox, reaches the app. */
internal fun WebView.listenToHostPage(heard: (HostMessage, JavaScriptReplyProxy) -> Unit) {
    val gate = HostGate(HostPage.ORIGIN, API_ORIGIN)
    WebViewCompat.addWebMessageListener(this, LISTENER, setOf(HostPage.ORIGIN)) { _, message, origin, isMainFrame, reply ->
        gate.admit(origin.toString(), isMainFrame, message.data)?.let { heard(it, reply) }
            ?: Log.w(TAG, "Refused a message from $origin")
    }
    loadUrl(HostPage.URL)
}

/** Has the host page frame the sandbox at [sandbox]. */
internal fun openSandbox(sandbox: String, title: String): String = buildJsonObject {
    put("kind", "open")
    put("src", HostPage.sandboxAddress(API_ORIGIN, sandbox))
    put("origin", API_ORIGIN)
    put("title", title)
}.toString()

/** Has the host page pass [message] to the sandbox it framed. */
internal fun toSandbox(message: JsonObject): String = buildJsonObject {
    put("kind", "post")
    put("message", message)
}.toString()
