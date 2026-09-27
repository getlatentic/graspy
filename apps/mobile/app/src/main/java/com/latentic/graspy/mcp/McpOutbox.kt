package com.latentic.graspy.mcp

import android.util.Log
import java.io.IOException
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
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
                put("text", "This is kept on the device and sent later.")
            })
        },
    )
}

/** A call's way to the server, as the outbox sees it. */
fun interface ToolCaller {
    suspend fun call(name: String, arguments: JsonObject): JsonObject
}

/**
 * A view's tools/call the server did not take is kept and sent in order later, as the web's MCP outbox does
 * (lib/mcp/outbox.ts). These calls record what the learner did, and the server takes each again without harm.
 * A call leaves the device only once the server takes it or refuses that very call ([refusesTheCall]); a lost
 * connection, a server failing or a session refused keeps it. Nothing is kept once the device no longer learns
 * as the learner ([stillLearning]), so a wipe leaves nothing of them.
 */
class McpOutbox(
    private val dao: KeptCallDao,
    private val ownerId: String,
    private val server: ToolCaller,
    private val stillLearning: () -> Boolean,
    /** Runs the learner check and the write as one: a wipe waits for a write already checked, then takes it too. */
    private val inOneTransaction: suspend (suspend () -> Unit) -> Unit = { it() },
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val keptNow = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** Tells each time a call is kept, so one kept while online is sent again without waiting for a reconnect. */
    val kept: Flow<Unit> = keptNow

    suspend fun callOrKeep(name: String, arguments: JsonObject): JsonObject {
        val failure = try {
            return server.call(name, arguments)
        } catch (failure: IOException) {
            failure
        }
        if (failure.refusesTheCall() || !keep(name, arguments)) throw failure
        return KEPT_RESULT
    }

    private suspend fun keep(name: String, arguments: JsonObject): Boolean {
        var kept = false
        inOneTransaction {
            if (stillLearning()) {
                dao.keep(KeptCallEntity(ownerId = ownerId, name = name, argumentsJson = arguments.toString(), keptAt = clock()))
                kept = true
            }
        }
        if (kept) keptNow.tryEmit(Unit)
        return kept
    }

    /** Sends what was kept, in order; stops at the first the server neither took nor refused. How many went. */
    suspend fun sendKept(): Int = sending.withLock {
        var sent = 0
        for (call in dao.kept(ownerId)) {
            try {
                server.call(call.name, mcpJson.parseToJsonElement(call.argumentsJson).jsonObject)
            } catch (failure: IOException) {
                if (!failure.refusesTheCall()) break
                Log.w(TAG, "The server refused a kept ${call.name}", failure)
            }
            dao.forget(call.id)
            sent += 1
        }
        sent
    }

    /** Sends what was kept; false while some of it is still on the device. */
    suspend fun sentEverything(): Boolean {
        sendKept()
        return dao.kept(ownerId).isEmpty()
    }

    private companion object {
        const val TAG = "GraspyOutbox"

        /** One run at a time on the device, whichever screen or leave started it, so no call goes twice at once. */
        val sending = Mutex()
    }
}
