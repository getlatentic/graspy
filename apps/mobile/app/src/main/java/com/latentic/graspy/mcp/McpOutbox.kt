package com.latentic.graspy.mcp

import android.util.Log
import java.io.IOException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** What a view is told of a call kept for later: it records what the learner did, and it will be sent. */
val KEPT_RESULT: JsonObject = buildJsonObject {
    put(
        "content",
        buildJsonArray {
            add(buildJsonObject {
                put("type", "text")
                put("text", "There is no connection: this is kept, and sent once there is.")
            })
        },
    )
}

/** A call's way to the server, as the outbox sees it. */
fun interface ToolCaller {
    suspend fun call(name: String, arguments: JsonObject): JsonObject
}

/**
 * A view's tools/call made with no connection is kept and sent in order once there is one, as the web's MCP
 * outbox does (lib/mcp/outbox.ts). These calls record what the learner did, and the server takes each again
 * without harm; one the server refuses is dropped, since it would be refused every time.
 */
class McpOutbox(private val dao: KeptCallDao, private val ownerId: String, private val server: ToolCaller, private val clock: () -> Long = System::currentTimeMillis) {
    private val sending = Mutex()

    suspend fun callOrKeep(name: String, arguments: JsonObject): JsonObject = try {
        server.call(name, arguments)
    } catch (refused: McpRefusal) {
        throw refused
    } catch (unreachable: IOException) {
        dao.keep(KeptCallEntity(ownerId = ownerId, name = name, argumentsJson = arguments.toString(), keptAt = clock()))
        KEPT_RESULT
    }

    /** Sends what was kept, in order; stops at the first that cannot reach the server. How many went. */
    suspend fun sendKept(): Int = sending.withLock {
        var sent = 0
        for (call in dao.kept(ownerId)) {
            try {
                server.call(call.name, mcpJson.parseToJsonElement(call.argumentsJson).jsonObject)
            } catch (refused: McpRefusal) {
                Log.w(TAG, "The server refused a kept ${call.name}", refused)
            } catch (unreachable: IOException) {
                break
            }
            dao.forget(call.id)
            sent += 1
        }
        sent
    }

    private companion object {
        const val TAG = "GraspyOutbox"
    }
}
