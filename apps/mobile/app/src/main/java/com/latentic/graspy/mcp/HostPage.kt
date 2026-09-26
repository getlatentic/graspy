package com.latentic.graspy.mcp

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.net.toUri
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream

/**
 * The page a view is hosted in, served by the app itself at graspy's web origin. The API's sandbox proxy
 * frames views only for an origin its CORS list allows, and the web app's is one; this WebView never
 * loads the real site, since every other address on that origin is refused here.
 */
object HostPage {
    const val ORIGIN = "https://graspy.getlatentic.com"
    private const val HOST = "graspy.getlatentic.com"
    private const val PATH = "/app-host/"
    const val URL = "$ORIGIN${PATH}host.html"
    const val REPLY_URL = "$ORIGIN${PATH}reply.html"
    private const val ASSETS = "app-host/"

    private val TYPES = mapOf("html" to "text/html", "js" to "text/javascript", "css" to "text/css", "woff2" to "font/woff2")
    // Files and folders by name alone: no "..", no absolute path.
    private val SAFE_PATH = Regex("^(?!.*\\.\\.)[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$")

    /**
     * The web app's own policy, narrowed to what each page does: the host page runs its own script and frames
     * the API; the reply page draws markdown and KaTeX, whose layout is inline styles, from its own files.
     */
    fun headers(apiOrigin: String, name: String = "host.html"): Map<String, String> = mapOf(
        "Content-Security-Policy" to (
            listOf("default-src 'none'", "script-src 'self'") +
                if (name.startsWith("reply")) {
                    listOf("style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src data:")
                } else {
                    listOf("style-src 'self'", "frame-src $apiOrigin")
                } +
                listOf("base-uri 'none'", "object-src 'none'", "form-action 'none'", "frame-ancestors 'none'")
            ).joinToString("; "),
        "X-Content-Type-Options" to "nosniff",
        "Referrer-Policy" to "no-referrer",
        "Permissions-Policy" to "camera=(), microphone=(), geolocation=()",
    )

    /** The sandbox proxy, told which host frames it and the policy the view's resource declared. */
    fun sandboxAddress(apiOrigin: String, view: UiView): String =
        "$apiOrigin/ui-sandbox".toUri().buildUpon()
            .appendQueryParameter("host", ORIGIN)
            .apply { view.csp?.let { appendQueryParameter("csp", it.toString()) } }
            .build()
            .toString()

    /** Null for an address off this origin, which loads as it would anywhere. [open] reads an app asset. */
    fun response(open: (String) -> InputStream, apiOrigin: String, url: Uri): WebResourceResponse? {
        if (url.scheme != "https" || url.host != HOST) return null
        val name = url.path.orEmpty().removePrefix(PATH).takeIf { url.path.orEmpty().startsWith(PATH) }
        val type = name?.substringAfterLast('.')?.let(TYPES::get)
        if (name == null || type == null || !SAFE_PATH.matches(name)) return refused()
        return try {
            WebResourceResponse(type, "utf-8", 200, "OK", headers(apiOrigin, name), open("$ASSETS$name"))
        } catch (missing: IOException) {
            refused()
        }
    }

    private fun refused() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
}

/** Serves the host page and keeps the WebView on it: a view's links open in the browser, if at all. */
// androidx.webkit's check does not see onRenderProcessGone overridden in Kotlin; it is, below.
@SuppressLint("MissingOnRenderProcessGone")
class HostPageClient(
    private val open: (String) -> InputStream,
    private val apiOrigin: String,
    private val onGone: () -> Unit = {},
) : WebViewClient() {
    /** A view whose renderer died is shown as unavailable, never taking the app down with it. */
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        onGone()
        return true
    }

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        HostPage.response(open, apiOrigin, request.url)

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        request.isForMainFrame && request.url.toString() != HostPage.URL
}
