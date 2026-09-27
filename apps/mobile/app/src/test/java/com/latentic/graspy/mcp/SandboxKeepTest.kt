package com.latentic.graspy.mcp

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The app's keep of a sandbox, as the web's: the proxy is asked once ready, and its kept notice is the answer. */
class SandboxKeepTest {
    private val keep = SandboxKeep(setOf(EARLIER, CURRENT))

    @Test
    fun `the proxy, once ready, is asked to keep its build's files, naming the sandboxes kept pages need`() {
        val step = keep.heard(buildJsonObject { put("jsonrpc", "2.0"); put("method", ViewSession.PROXY_READY) })

        assertEquals(
            SandboxKeep.Step.Ask(
                buildJsonObject {
                    put("jsonrpc", "2.0")
                    put("method", "graspy/sandbox-keep")
                    putJsonObject("params") {
                        put("sandboxes", buildJsonArray { add(JsonPrimitive(EARLIER)); add(JsonPrimitive(CURRENT)) })
                    }
                },
            ),
            step,
        )
    }

    @Test
    fun `the proxy's answer is whether every file is held`() {
        assertEquals(SandboxKeep.Step.Done(true), keep.heard(kept(JsonPrimitive(true))))
        assertEquals(SandboxKeep.Step.Done(false), keep.heard(kept(JsonPrimitive(false))))
    }

    @Test
    fun `an answer that is not a yes is a no`() {
        assertEquals(SandboxKeep.Step.Done(false), keep.heard(kept(JsonPrimitive("true"))))
        assertEquals(SandboxKeep.Step.Done(false), keep.heard(buildJsonObject { put("method", "graspy/sandbox-kept") }))
    }

    @Test
    fun `anything else the proxy says is not an answer`() {
        assertNull(keep.heard(buildJsonObject { put("method", "ui/notifications/size-changed") }))
        assertNull(keep.heard(JsonPrimitive("graspy/sandbox-kept")))
    }

    private fun kept(value: JsonPrimitive) = buildJsonObject {
        put("jsonrpc", "2.0")
        put("method", "graspy/sandbox-kept")
        putJsonObject("params") { put("kept", value) }
    }

    private companion object {
        const val EARLIER = "/ui-sandbox/fedcba9876543210/"
        const val CURRENT = "/ui-sandbox/0123456789abcdef/"
    }
}
