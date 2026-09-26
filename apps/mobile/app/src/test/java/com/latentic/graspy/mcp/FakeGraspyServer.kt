package com.latentic.graspy.mcp

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LearnerRecord
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest

const val LESSON_VIEW = "ui://graspy/lesson"
const val ROUTE_TOOL = "learner_route"
const val LESSON_HTML = "<!doctype html><script src=\"/views/assets/lesson.js\"></script>"

/**
 * graspy's server as far as offline lessons reach it: the learner's plan and record, and MCP for one
 * lesson view and its tools. Answering with nothing turns every MCP answer into an empty 200; a tool in
 * [toolReplies] is answered 200 as JSON with that body, whatever it is.
 */
class FakeGraspyServer(var plan: LearnerPlan, var record: LearnerRecord) : Dispatcher() {
    var recordFails = false
    var answersWithNothing = false
    var toolReplies: Map<String, String> = emptyMap()
    val toolsCalled: MutableList<String> = CopyOnWriteArrayList()

    /** The server's answer to learner_route, the classes it was asked for, and whether it answers at all. */
    var voiceOnly = false
    var routeFails = false
    val routesAsked: MutableList<JsonObject> = CopyOnWriteArrayList()
    val web = MockWebServer().also { it.dispatcher = this }

    /** Calls bound for graspy's API, sent here instead, as the app's session-bearing calls are. */
    val calls: Call.Factory = OkHttpClient().let { client ->
        Call.Factory { request ->
            client.newCall(request.newBuilder().url(request.url.newBuilder().scheme("http").host(web.hostName).port(web.port).build()).build())
        }
    }

    override fun dispatch(request: RecordedRequest): MockResponse {
        val path = request.requestUrl?.encodedPath.orEmpty()
        return when {
            path == "/mcp" -> mcp(request)
            path == "/api/learner/curriculum" -> json(buildJsonObject { put("plan", plan.toJson()) })
            path == "/api/learner" && recordFails -> MockResponse().setResponseCode(503)
            path == "/api/learner" -> json(apiJson.encodeToJsonElement(LearnerRecord.serializer(), record).jsonObject)
            else -> MockResponse().setResponseCode(404)
        }
    }

    private fun mcp(request: RecordedRequest): MockResponse {
        if (answersWithNothing) return MockResponse().setHeader("Content-Type", "text/event-stream").setBody("")
        val body = mcpJson.parseToJsonElement(request.body.readUtf8()).jsonObject
        val method = body.string("method").orEmpty()
        val tool = if (method == "tools/call") body.getValue("params").jsonObject.string("name")?.also(toolsCalled::add) else null
        if (tool == ROUTE_TOOL) return route(body)
        tool?.let(toolReplies::get)?.let { return MockResponse().setHeader("Content-Type", "application/json").setBody(it) }
        return json(
            buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", body.getValue("id"))
                put("result", resultOf(method, body.getValue("params").jsonObject))
            },
        )
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
                    add(buildJsonObject { put("name", ROUTE_TOOL) })
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

    private fun route(body: JsonObject): MockResponse {
        if (routeFails) return MockResponse().setResponseCode(503)
        val params = body.getValue("params").jsonObject
        routesAsked += params["arguments"]?.jsonObject ?: JsonObject(emptyMap())
        return json(
            buildJsonObject {
                put("jsonrpc", "2.0")
                put("id", body.getValue("id"))
                putJsonObject("result") {
                    put("content", buildJsonArray {})
                    putJsonObject("structuredContent") { put("voiceOnly", voiceOnly) }
                }
            },
        )
    }

    private fun json(body: JsonObject) = MockResponse().setHeader("Content-Type", "application/json").setBody(body.toString())
}
