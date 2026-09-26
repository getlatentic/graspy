package com.latentic.graspy.mcp

import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.lesson.eventually
import com.latentic.graspy.lesson.topic
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.TopicMark
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
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
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The learner's connection wired as the app wires it, against a server that answers MCP and then goes
 * away: what was copied while it answered opens, view and lesson, on a phone that never showed either.
 */
@RunWith(RobolectricTestRunner::class)
class LearnerConnectionTest {
    private val database = inMemoryDatabase()
    private val server = MockWebServer().apply { dispatcher = FakeMcp() }
    private val endpoint = server.url("/mcp")
    private val calls = OkHttpClient()

    @After
    fun close() {
        database.close()
        runCatching { server.shutdown() }
    }

    @Test
    fun `a ready lesson copied when the plan loads opens with no connection, view and content`() = runBlocking {
        val online = connection()
        val copier = launch { online.lessons.copyWhenAsked() }
        online.lessons.copyReady(PLAN, LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9"))))
        eventually { database.lessonCopyDao().copied(ADA_KEY).isNotEmpty() && database.keptViewDao().kept(LESSON_VIEW) != null }
        copier.cancelAndJoin()
        server.shutdown()

        val offline = connection()
        val card = offline.lessons.openOrCopy(topic(1))

        assertEquals(LESSON_VIEW, card.resourceUri)
        assertEquals("ready", card.toolResult.getValue("structuredContent").jsonObject.string("status"))
        assertEquals(LESSON_HTML, offline.view(card.resourceUri).html)
    }

    @Test
    fun `a view shown once opens with no connection after the app starts again`() = runBlocking {
        assertEquals(LESSON_HTML, connection().view(LESSON_VIEW).html)
        server.shutdown()

        assertEquals(LESSON_HTML, connection().view(LESSON_VIEW).html)
    }

    private fun connection() = LearnerConnection(database, ADA_KEY, calls, endpoint) { true }

    /** Answers MCP as graspy's server does for one lesson view and its tools. */
    private class FakeMcp : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val body = mcpJson.parseToJsonElement(request.body.readUtf8()).jsonObject
            val method = body.string("method").orEmpty()
            val reply = buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", body.getValue("id"))
                put("result", resultOf(method, body.getValue("params").jsonObject))
            }
            return MockResponse().setHeader("Content-Type", "application/json").setBody(reply.toString())
        }

        private fun resultOf(method: String, params: JsonObject): JsonObject = when (method) {
            "tools/list" -> buildJsonObject {
                put(
                    "tools",
                    buildJsonArray {
                        add(buildJsonObject {
                            put("name", "give_lesson")
                            putJsonObject("_meta") { putJsonObject("ui") { put("resourceUri", LESSON_VIEW) } }
                        })
                        add(buildJsonObject { put("name", "lesson_progress") })
                    },
                )
            }
            "resources/list" -> buildJsonObject {
                put("resources", buildJsonArray { add(buildJsonObject { put("uri", LESSON_VIEW); put("title", "Lesson") }) })
            }
            "resources/read" -> buildJsonObject {
                put(
                    "contents",
                    buildJsonArray {
                        add(buildJsonObject {
                            put("uri", params.string("uri"))
                            put("mimeType", McpClient.RESOURCE_MIME_TYPE)
                            put("text", LESSON_HTML)
                        })
                    },
                )
            }
            "tools/call" -> buildJsonObject {
                put("content", buildJsonArray {})
                putJsonObject("structuredContent") {
                    put("status", "ready")
                    put("whole", true)
                    putJsonObject("lesson") { put("title", "Fractions") }
                }
            }
            else -> error("$method is not answered here")
        }
    }

    private companion object {
        const val ADA_KEY = "uid-1/aaaaaaaaaaaa"
        const val LESSON_VIEW = "ui://graspy/lesson"
        const val LESSON_HTML = "<!doctype html><script src=\"/views/assets/lesson.js\"></script>"
    }
}
