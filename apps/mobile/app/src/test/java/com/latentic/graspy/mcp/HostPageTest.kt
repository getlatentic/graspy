package com.latentic.graspy.mcp

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import java.io.File
import java.io.FileNotFoundException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** The host page is served from the app with the web's policy, and nothing else on its origin loads. */
@RunWith(RobolectricTestRunner::class)
class HostPageTest {
    private val assets = File("src/main/assets")
    private val open = { name: String -> File(assets, name).takeIf(File::isFile)?.inputStream() ?: throw FileNotFoundException(name) }

    @Test
    fun `the host page comes from the app, framing only the API`() {
        val page = HostPage.response(open, API, Uri.parse(HostPage.URL))!!

        assertEquals(200, page.statusCode)
        assertEquals("text/html", page.mimeType)
        val policy = page.responseHeaders.getValue("Content-Security-Policy")
        assertTrue(policy, "frame-src $API" in policy.split("; "))
        assertTrue(policy, "script-src 'self'" in policy.split("; "))
        assertTrue(policy, "frame-ancestors 'none'" in policy.split("; "))
        assertTrue(page.data.reader().readText().contains("host.js"))
    }

    @Test
    fun `every other address on graspy's web origin is refused, never fetched`() {
        listOf("https://graspy.getlatentic.com/", "https://graspy.getlatentic.com/app/learn", "https://graspy.getlatentic.com/app-host/missing.js", "https://graspy.getlatentic.com/app-host/../secret.html", "https://graspy.getlatentic.com/app-host/sub/host.js", "https://graspy.getlatentic.com/app-host/vendor/marked-LICENSE.md")
            .forEach { assertEquals(it, 404, HostPage.response(open, API, Uri.parse(it))?.statusCode) }
    }

    @Test
    fun `the reply page draws KaTeX from its own files, and frames nothing`() {
        val page = HostPage.response(open, API, Uri.parse(HostPage.REPLY_URL))!!
        val policy = page.responseHeaders.getValue("Content-Security-Policy").split("; ")

        assertEquals(200, page.statusCode)
        assertTrue(policy.toString(), "style-src 'self' 'unsafe-inline'" in policy)
        assertTrue(policy.none { it.startsWith("frame-src") })
        assertEquals(200, HostPage.response(open, API, Uri.parse("${HostPage.ORIGIN}/app-host/vendor/katex.min.js"))?.statusCode)
        assertEquals("font/woff2", HostPage.response(open, API, Uri.parse("${HostPage.ORIGIN}/app-host/vendor/fonts/KaTeX_Main-Regular.woff2"))?.mimeType)
    }

    @Test
    fun `the sandbox and the view's files load from the API as they would anywhere`() {
        assertNull(HostPage.response(open, API, Uri.parse("$API/ui-sandbox/0123456789abcdef/?host=x")))
        assertNull(HostPage.response(open, API, Uri.parse("http://graspy.getlatentic.com/app-host/host.html")))
    }

    @Test
    fun `the sandbox of the view's build is told graspy's host, and nothing the view could choose`() {
        val address = Uri.parse(HostPage.sandboxAddress(API, "/ui-sandbox/0123456789abcdef/"))

        assertEquals("$API/ui-sandbox/0123456789abcdef/", address.buildUpon().clearQuery().build().toString())
        assertEquals(setOf("host"), address.queryParameterNames)
        assertEquals(HostPage.ORIGIN, address.getQueryParameter("host"))
    }

    @Test
    fun `the WebView stays on the host page`() {
        val client = HostPageClient(open, API)
        val webView = WebView(RuntimeEnvironment.getApplication())

        assertTrue(client.shouldOverrideUrlLoading(webView, navigation("https://example.org/", mainFrame = true)))
        assertFalse(client.shouldOverrideUrlLoading(webView, navigation(HostPage.URL, mainFrame = true)))
    }

    private fun navigation(url: String, mainFrame: Boolean) = object : WebResourceRequest {
        override fun getUrl(): Uri = Uri.parse(url)
        override fun isForMainFrame() = mainFrame
        override fun isRedirect() = false
        override fun hasGesture() = true
        override fun getMethod() = "GET"
        override fun getRequestHeaders(): Map<String, String> = emptyMap()
    }

    private companion object {
        const val API = "https://graspy-api.getlatentic.com"
    }
}
