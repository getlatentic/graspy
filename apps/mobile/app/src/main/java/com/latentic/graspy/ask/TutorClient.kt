package com.latentic.graspy.ask

import java.util.UUID
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.HttpUrl

/** One message to the tutor, with what the learner's views did since the last and what went unanswered. */
data class TutorTurn(
    val text: String,
    val contextId: String?,
    val learner: JsonObject,
    val appCalls: List<JsonObject> = emptyList(),
    val unanswered: List<String> = emptyList(),
)

/**
 * graspy's tutor over A2A: the JSON-RPC SendStreamingMessage the web's client sends, read as server-sent
 * events. The turn outlives the connection, so a question is a [TutorRun] that follows it to its end.
 */
class TutorClient(
    calls: Call.Factory,
    endpoint: HttpUrl,
    chats: HttpUrl,
    private val timing: Timing = Timing(),
) {
    private val wire = TutorWire(calls, endpoint, chats)

    /** Asks the question. The chat is the thread's, or a new one; the message id names the turn from here on. */
    fun start(turn: TutorTurn): TutorRun {
        val chat = turn.contextId ?: UUID.randomUUID().toString()
        val messageId = UUID.randomUUID().toString()
        return TutorRun(wire, chat, messageId, request(turn, chat, messageId), timing)
    }

    private fun request(turn: TutorTurn, chat: String, messageId: String): JsonObject = buildJsonObject {
        put("jsonrpc", "2.0")
        put("id", UUID.randomUUID().toString())
        put("method", "SendStreamingMessage")
        putJsonObject("params") { put("message", message(turn, chat, messageId)) }
    }

    private fun message(turn: TutorTurn, chat: String, messageId: String): JsonObject = buildJsonObject {
        put("messageId", messageId)
        put("role", "ROLE_USER")
        put("parts", parts(turn))
        put("contextId", chat)
        putJsonObject("metadata") { put("learner", turn.learner) }
    }

    private fun parts(turn: TutorTurn): JsonArray = buildJsonArray {
        add(buildJsonObject { put("text", turn.text) })
        val beside = buildJsonObject {
            if (turn.appCalls.isNotEmpty()) put(APP_CALLS, JsonArray(turn.appCalls))
            if (turn.unanswered.isNotEmpty()) put(UNANSWERED, JsonArray(turn.unanswered.map(::JsonPrimitive)))
        }
        if (beside.isNotEmpty()) add(buildJsonObject { put("data", beside) })
    }

    companion object {
        const val MAX_MESSAGE = 2000
        private const val APP_CALLS = "appCalls"
        private const val UNANSWERED = "unanswered"
    }
}
