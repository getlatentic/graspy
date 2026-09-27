package com.latentic.graspy.mcp

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A view is read with the sandbox of the build its document belongs to, which graspy's server names. */
@RunWith(RobolectricTestRunner::class)
class McpClientViewTest {
    private var meta: JsonObject? = null
    private val web = MockWebServer().also { server ->
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val message = mcpJson.parseToJsonElement(request.body.readUtf8()).jsonObject
                val result = when (message.string("method")) {
                    "resources/read" -> buildJsonObject {
                        put(
                            "contents",
                            buildJsonArray {
                                add(
                                    buildJsonObject {
                                        put("uri", LESSON_VIEW)
                                        put("mimeType", McpClient.RESOURCE_MIME_TYPE)
                                        put("text", LESSON_HTML)
                                        meta?.let { put("_meta", it) }
                                    },
                                )
                            },
                        )
                    }
                    else -> buildJsonObject { put("tools", buildJsonArray {}); put("resources", buildJsonArray {}) }
                }
                val reply = buildJsonObject {
                    put("jsonrpc", "2.0")
                    message["id"]?.let { put("id", it) }
                    put("result", result)
                }
                return MockResponse().setHeader("Content-Type", "application/json").setBody(reply.toString())
            }
        }
    }
    private val mcp = McpClient(OkHttpClient(), web.url("/mcp"))

    @After
    fun close() = web.shutdown()

    @Test
    fun `a view opens in the sandbox its resource names`() = runBlocking {
        meta = buildJsonObject {
            put("graspy/sandbox", LESSON_SANDBOX)
            putJsonObject("ui") { putJsonObject("csp") { put("resourceDomains", buildJsonArray { add(JsonPrimitive("https://api.example")) }) } }
        }

        val view = mcp.view(LESSON_VIEW)

        assertEquals(LESSON_SANDBOX, view.sandbox)
        assertEquals(LESSON_HTML, view.html)
    }

    @Test
    fun `a view whose resource names no sandbox, or not a path, is refused`() {
        listOf(null, buildJsonObject { putJsonObject("ui") {} }, buildJsonObject { put("graspy/sandbox", "https://evil.example/") })
            .forEach { named ->
                meta = named
                assertThrows(McpRefusal::class.java) { runBlocking { McpClient(OkHttpClient(), web.url("/mcp")).view(LESSON_VIEW) } }
            }
    }
}
