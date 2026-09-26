package com.latentic.graspy.mcp

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Only graspy's own host page, in the main frame, relaying the API's sandbox, reaches the app. */
class HostGateTest {
    private val gate = HostGate(HOST, API)
    private val proxyReady = """{"kind":"relay","origin":"$API","data":{"jsonrpc":"2.0","method":"ui/notifications/sandbox-proxy-ready"}}"""

    @Test
    fun `the host page's relay of the sandbox is let through unread`() {
        val expected = buildJsonObject {
            put("jsonrpc", "2.0")
            put("method", "ui/notifications/sandbox-proxy-ready")
        }
        assertEquals(HostMessage.Relay(expected), gate.admit(HOST, isMainFrame = true, proxyReady))
        assertEquals(HostMessage.Ready, gate.admit("$HOST/", isMainFrame = true, """{"kind":"ready"}"""))
    }

    @Test
    fun `a message from any other origin is refused`() {
        listOf(API, "https://graspy.getlatentic.com.evil.test", "http://graspy.getlatentic.com", "null", "").forEach {
            assertNull(it, gate.admit(it, isMainFrame = true, proxyReady))
        }
    }

    @Test
    fun `a message from a frame inside the host page is refused`() {
        assertNull(gate.admit(HOST, isMainFrame = false, proxyReady))
    }

    @Test
    fun `a relay of a frame on any origin but the API's is refused`() {
        val elsewhere = proxyReady.replace(API, "https://graspy.getlatentic.com")
        assertNull(gate.admit(HOST, isMainFrame = true, elsewhere))
        assertNull(gate.admit(HOST, isMainFrame = true, """{"kind":"relay","data":{}}"""))
    }

    @Test
    fun `anything that is not the host page's own message is refused`() {
        listOf(null, "not json", "[]", """{"kind":"open"}""").forEach {
            assertNull(it, gate.admit(HOST, isMainFrame = true, it))
        }
    }

    private companion object {
        const val HOST = "https://graspy.getlatentic.com"
        const val API = "https://graspy-api.getlatentic.com"
    }
}
