package com.latentic.graspy.mcp

import android.util.Base64
import com.latentic.graspy.network.readTimeout
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.Call
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** A view a tool's result is shown in: its document and the policy its resource declared. */
data class UiView(val html: String, val title: String, val csp: JsonObject?, val permissions: JsonObject?)

/** A tool's result to show as its view, as the tutor's cards carry it. */
@Serializable
data class ViewCard(
    val resourceUri: String,
    val toolName: String,
    val toolInput: JsonObject,
    val toolResult: JsonObject,
)

fun JsonObject.isToolError(): Boolean = (this["isError"] as? JsonPrimitive)?.booleanOrNull == true

/**
 * graspy's MCP server, called as the learner: the tools a view may call, the views tools are shown in,
 * and the calls themselves. The server is stateless, so each request stands alone.
 */
class McpClient(private val calls: Call.Factory, private val endpoint: HttpUrl) {
    private val catalogueLock = Mutex()
    private var catalogue: Catalogue? = null
    private val views = ConcurrentHashMap<String, UiView>()
    private val ids = AtomicLong()

    private class Catalogue(val appTools: Set<String>, val viewOf: Map<String, String>, val titles: Map<String, String>)

    /** MCP Apps refuses a view any tool that is the model's alone. */
    suspend fun callTool(name: String, arguments: JsonObject): JsonObject {
        if (name !in catalogue().appTools) throw McpRefusal("$name cannot be called from a view")
        return rpc(
            "tools/call",
            buildJsonObject {
                put("name", name)
                put("arguments", arguments)
            },
        )
    }

    suspend fun openToolView(name: String, arguments: JsonObject): ViewCard {
        val resourceUri = viewOf(name)
        val result = callTool(name, arguments)
        if (result.isToolError()) throw McpRefusal("$name was refused")
        return ViewCard(resourceUri, name, arguments, result)
    }

    /** The view [name]'s result is shown in. */
    suspend fun viewOf(name: String): String = catalogue().viewOf[name] ?: throw McpRefusal("$name has no view")

    /** The views the server's tools are shown in. */
    suspend fun viewUris(): Set<String> = catalogue().viewOf.values.toSet()

    /** Read once per process. */
    suspend fun view(uri: String): UiView = views[uri] ?: readView(uri).also { views[uri] = it }

    private suspend fun catalogue(): Catalogue = catalogueLock.withLock {
        catalogue ?: try {
            catalogueOf(
                tools = rpc("tools/list", JsonObject(emptyMap()))["tools"]?.jsonArray.orEmpty(),
                resources = rpc("resources/list", JsonObject(emptyMap()))["resources"]?.jsonArray.orEmpty(),
            ).also { catalogue = it }
        } catch (refused: McpRefusal) {
            // A server that cannot be connected to has said nothing of the call that needed it.
            throw McpRefusal("The server's catalogue was not read: ${refused.message}", aboutTheCall = false)
        }
    }

    private fun catalogueOf(tools: List<JsonElement>, resources: List<JsonElement>): Catalogue {
        val toolObjects = tools.map { it.jsonObject }
        return Catalogue(
            appTools = toolObjects.filterNot(::modelOnly).mapNotNull { it.string("name") }.toSet(),
            viewOf = toolObjects.mapNotNull { tool ->
                val uri = tool.path("_meta", "ui")?.string("resourceUri") ?: return@mapNotNull null
                tool.string("name")?.let { it to uri }
            }.toMap(),
            titles = resources.map { it.jsonObject }.mapNotNull { resource ->
                val uri = resource.string("uri") ?: return@mapNotNull null
                uri to (resource.string("title") ?: resource.string("name") ?: uri)
            }.toMap(),
        )
    }

    private fun modelOnly(tool: JsonObject): Boolean {
        val visibility = tool.path("_meta", "ui")?.get("visibility") as? JsonArray ?: return false
        return visibility.size == 1 && (visibility[0] as? JsonPrimitive)?.contentOrNull == "model"
    }

    private suspend fun readView(uri: String): UiView {
        val title = catalogue().titles[uri] ?: uri
        val contents = rpc("resources/read", buildJsonObject { put("uri", uri) })["contents"]?.jsonArray.orEmpty()
        val content = contents.singleOrNull()?.jsonObject
        if (content == null || content.string("mimeType") != RESOURCE_MIME_TYPE) throw McpRefusal("$uri is not an MCP App view")
        val html = content.string("text")
            ?: content.string("blob")?.let { String(Base64.decode(it, Base64.DEFAULT), Charsets.UTF_8) }
            ?: throw McpRefusal("$uri has no document")
        val ui = content.path("_meta", "ui")
        return UiView(html, title, ui?.get("csp") as? JsonObject, ui?.get("permissions") as? JsonObject)
    }

    private suspend fun rpc(method: String, params: JsonObject): JsonObject = withContext(Dispatchers.IO) {
        val id = ids.incrementAndGet()
        val body = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            put("method", method)
            put("params", params)
        }.toString().toRequestBody(JSON)
        val request = Request.Builder()
            .url(endpoint)
            .header("Accept", "application/json, text/event-stream")
            .readTimeout(READ_SECONDS)
            .post(body)
            .build()
        calls.newCall(request).execute().use { response -> resultOf(response, method) }
    }

    private fun resultOf(response: Response, method: String): JsonObject {
        val text = response.body.string()
        // The server answered: not a lost connection, so no copy stands in for it.
        if (!response.isSuccessful) throw McpRefusal("$method failed: HTTP ${response.code}", refusedOverHttp(response.code, text))
        val message = if (response.header("Content-Type").orEmpty().startsWith("text/event-stream")) {
            text.lineSequence().filter { it.startsWith("data:") }.lastOrNull()?.removePrefix("data:")?.trim()
        } else {
            text
        }
        val reply = message?.let(::replyOf) ?: throw McpRefusal("$method returned no JSON-RPC message", aboutTheCall = false)
        reply["error"]?.let { throw McpRefusal("$method refused: $it", refusedOverRpc(it)) }
        return reply["result"] as? JsonObject ?: throw McpRefusal("$method returned no result", aboutTheCall = false)
    }

    private fun replyOf(message: String): JsonObject? = try {
        mcpJson.parseToJsonElement(message) as? JsonObject
    } catch (undecodable: SerializationException) {
        null
    }

    companion object {
        const val RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"
        private const val READ_SECONDS = 60L
        private val JSON = "application/json".toMediaType()
    }
}

internal val mcpJson = Json { ignoreUnknownKeys = true }

internal fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

internal fun JsonObject.path(vararg keys: String): JsonObject? =
    keys.fold(this as JsonObject?) { node, key -> node?.get(key) as? JsonObject }
