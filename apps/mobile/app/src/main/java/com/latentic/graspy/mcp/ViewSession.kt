package com.latentic.graspy.mcp

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.ceil
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** What graspy does for one view: the calls it may make, and what its messages, links and size mean. */
interface ViewHost {
    suspend fun callTool(name: String, arguments: JsonObject): JsonObject

    fun toolCalled(name: String, arguments: JsonObject, result: JsonObject) = Unit

    /** The view's ui/message; false while another turn runs. */
    fun message(text: String): Boolean = false

    fun openLink(url: String)

    fun resize(height: Int)

    /** The view has its tool's input and result. */
    fun shown() = Unit
}

/** Told to a view when it initialises, as the web tells it: light, inline, at most [VIEW_MAX_HEIGHT] tall. */
data class HostContext(val locale: String) {
    fun toJson(): JsonObject = buildJsonObject {
        put("theme", "light")
        put("platform", "mobile")
        put("locale", locale)
        put("displayMode", "inline")
        put("availableDisplayModes", buildJsonArray { add(JsonPrimitive("inline")) })
        putJsonObject("containerDimensions") { put("maxHeight", VIEW_MAX_HEIGHT) }
    }
}

const val VIEW_MAX_HEIGHT = 2000

/**
 * One view's MCP Apps conversation, in the order the web's AppBridge keeps: the sandbox proxy says it is
 * ready and gets the view's document; the view initialises; then it is told its tool's input and result.
 * After that it may call tools, send a message, open a link or change its size. [send] carries each
 * message to the proxy, which passes it to the view.
 */
class ViewSession(
    private val card: ViewCard,
    private val view: UiView,
    private val context: HostContext,
    private val host: ViewHost,
    private val send: (JsonObject) -> Unit,
) {
    private var documentSent = false
    private val waiting = ConcurrentHashMap<Long, CompletableDeferred<JsonObject>>()
    private val ids = AtomicLong()

    suspend fun receive(message: JsonElement) {
        val body = message as? JsonObject ?: return
        val method = body.string("method")
        val id = body["id"]
        when {
            method != null && id != null -> answer(id, method, body.params())
            method != null -> heard(method, body.params())
            id != null -> (id as? JsonPrimitive)?.content?.toLongOrNull()?.let { waiting.remove(it) }?.complete(body)
        }
    }

    /** Asks the view to finish, waiting no longer than [TEARDOWN_MS] for it. */
    suspend fun teardown() {
        val id = ids.incrementAndGet()
        val reply = CompletableDeferred<JsonObject>().also { waiting[id] = it }
        send(request(id, TEARDOWN, JsonObject(emptyMap())))
        withTimeoutOrNull(TEARDOWN_MS) { reply.await() }
        waiting.remove(id)
    }

    private suspend fun answer(id: JsonElement, method: String, params: JsonObject) {
        val reply = try {
            respond(method, params)?.let { result(id, it) } ?: error(id, METHOD_NOT_FOUND, "$method is not offered")
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            error(id, INTERNAL_ERROR, failure.message ?: "$method failed")
        }
        send(reply)
    }

    private suspend fun respond(method: String, params: JsonObject): JsonObject? = when (method) {
        INITIALIZE -> initialized(params)
        TOOLS_CALL -> toolCall(params)
        MESSAGE -> if (host.message(textOf(params))) JsonObject(emptyMap()) else buildJsonObject { put("isError", true) }
        OPEN_LINK -> openLink(params)
        DISPLAY_MODE -> buildJsonObject { put("mode", "inline") }
        PING -> JsonObject(emptyMap())
        else -> null
    }

    private fun heard(method: String, params: JsonObject) {
        when (method) {
            PROXY_READY -> sendDocument()
            INITIALIZED -> {
                send(notification(TOOL_INPUT, buildJsonObject { put("arguments", card.toolInput) }))
                send(notification(TOOL_RESULT, card.toolResult))
                host.shown()
            }
            SIZE_CHANGED -> (params["height"] as? JsonPrimitive)?.doubleOrNull?.let {
                host.resize(ceil(it).toInt().coerceIn(0, VIEW_MAX_HEIGHT))
            }
        }
    }

    private fun sendDocument() {
        if (documentSent) return
        documentSent = true
        send(
            notification(
                RESOURCE_READY,
                buildJsonObject {
                    put("html", view.html)
                    put("title", view.title)
                    view.csp?.let { put("csp", it) }
                    view.permissions?.let { put("permissions", it) }
                },
            ),
        )
    }

    private fun initialized(params: JsonObject): JsonObject {
        val version = params.string("protocolVersion")?.takeIf { it in SUPPORTED_VERSIONS } ?: LATEST_VERSION
        return buildJsonObject {
            put("protocolVersion", version)
            putJsonObject("hostInfo") {
                put("name", HOST_NAME)
                put("version", HOST_VERSION)
            }
            putJsonObject("hostCapabilities") {
                putJsonObject("openLinks") {}
                putJsonObject("serverTools") {}
                putJsonObject("logging") {}
            }
            put("hostContext", context.toJson())
        }
    }

    private suspend fun toolCall(params: JsonObject): JsonObject {
        val name = params.string("name") ?: throw McpRefusal("tools/call names no tool")
        val arguments = params["arguments"] as? JsonObject ?: JsonObject(emptyMap())
        val result = host.callTool(name, arguments)
        if (!result.isToolError()) host.toolCalled(name, arguments, result)
        return result
    }

    private fun openLink(params: JsonObject): JsonObject {
        val url = params.string("url").orEmpty()
        if (WEB_LINK.matches(url)) host.openLink(url)
        return JsonObject(emptyMap())
    }

    private fun textOf(params: JsonObject): String =
        (params["content"] as? JsonArray).orEmpty()
            .mapNotNull { it as? JsonObject }
            .filter { it.string("type") == "text" }
            .mapNotNull { it.string("text") }
            .joinToString("\n")

    private fun JsonObject.params(): JsonObject = this["params"] as? JsonObject ?: JsonObject(emptyMap())

    companion object {
        const val PROXY_READY = "ui/notifications/sandbox-proxy-ready"
        const val RESOURCE_READY = "ui/notifications/sandbox-resource-ready"
        const val INITIALIZE = "ui/initialize"
        const val INITIALIZED = "ui/notifications/initialized"
        const val TOOL_INPUT = "ui/notifications/tool-input"
        const val TOOL_RESULT = "ui/notifications/tool-result"
        const val SIZE_CHANGED = "ui/notifications/size-changed"
        const val MESSAGE = "ui/message"
        const val OPEN_LINK = "ui/open-link"
        const val DISPLAY_MODE = "ui/request-display-mode"
        const val TEARDOWN = "ui/resource-teardown"
        const val TOOLS_CALL = "tools/call"
        const val PING = "ping"
        const val LATEST_VERSION = "2026-01-26"
        val SUPPORTED_VERSIONS = setOf(LATEST_VERSION)
        const val HOST_NAME = "graspy"
        const val HOST_VERSION = "1.0.0"
        const val METHOD_NOT_FOUND = -32601
        const val INTERNAL_ERROR = -32603
        private const val TEARDOWN_MS = 500L
        private val WEB_LINK = Regex("^https?://.+")

        private fun request(id: Long, method: String, params: JsonObject) = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            put("method", method)
            put("params", params)
        }

        private fun notification(method: String, params: JsonObject) = buildJsonObject {
            put("jsonrpc", "2.0")
            put("method", method)
            put("params", params)
        }

        private fun result(id: JsonElement, result: JsonObject) = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            put("result", result)
        }

        private fun error(id: JsonElement, code: Int, message: String) = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            putJsonObject("error") {
                put("code", code)
                put("message", message)
            }
        }
    }
}
