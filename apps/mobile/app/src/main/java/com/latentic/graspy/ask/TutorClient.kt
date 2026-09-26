package com.latentic.graspy.ask

import com.latentic.graspy.network.readServerEvents
import com.latentic.graspy.network.readTimeout
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** One message to the tutor, with what the learner's views did since the last and what went unanswered. */
data class TutorTurn(
    val text: String,
    val contextId: String?,
    val learner: JsonObject,
    val appCalls: List<JsonObject> = emptyList(),
    val unanswered: List<String> = emptyList(),
)

/** The tutor could not be reached, or stopped before answering; [retryable] when trying again may help. */
class TutorUnreachable(message: String, val retryable: Boolean) : IOException(message)

/**
 * graspy's tutor over A2A: the JSON-RPC SendStreamingMessage the web's client sends, read as server-sent
 * events. The stream is a preview; the finished reply replaces what streamed.
 */
class TutorClient(private val calls: Call.Factory, private val endpoint: HttpUrl) {
    suspend fun ask(turn: TutorTurn, listener: TurnListener): TutorReply {
        val reader = TurnReader(turn.contextId, listener)
        return try {
            askOnce(turn, reader)
        } catch (failure: TutorUnreachable) {
            // One silent retry for a gateway blip, unless words already showed: a rerun would repeat them.
            if (!failure.retryable || reader.heard) throw failure
            delay(RETRY_MS)
            askOnce(turn, TurnReader(turn.contextId, listener))
        }
    }

    private suspend fun askOnce(turn: TutorTurn, reader: TurnReader): TutorReply = withContext(Dispatchers.IO) {
        val call = calls.newCall(request(turn))
        val stop = currentCoroutineContext()[Job]?.invokeOnCompletion { if (it is CancellationException) call.cancel() }
        try {
            call.execute().use { response ->
                if (!response.isSuccessful) throw TutorUnreachable("The tutor answered HTTP ${response.code}", response.code >= 500)
                readServerEvents(response.body.source()) { event -> event.readInto(reader) }
            }
        } catch (failure: TutorUnreachable) {
            throw failure
        } catch (failure: IOException) {
            currentCoroutineContext()[Job]?.let { if (it.isCancelled) throw CancellationException("The learner stopped the tutor") }
            throw TutorUnreachable(failure.message ?: "The tutor could not be reached", retryable = true)
        } finally {
            stop?.dispose()
        }
        val reply = reader.reply()
        if (reply.text.isEmpty() && !reader.finished) throw TutorUnreachable("The tutor stopped before answering", retryable = false)
        reply
    }

    private fun JsonObject.readInto(reader: TurnReader) {
        (this["error"] as? JsonObject)?.let { throw TutorUnreachable("The tutor refused: $it", retryable = false) }
        (this["result"] as? JsonObject)?.let(reader::read)
    }

    private fun request(turn: TutorTurn): Request {
        val body = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", UUID.randomUUID().toString())
            put("method", "SendStreamingMessage")
            putJsonObject("params") { put("message", message(turn)) }
        }
        return Request.Builder()
            .url(endpoint)
            .header("Accept", "text/event-stream")
            .header("A2A-Version", PROTOCOL_VERSION)
            .readTimeout(READ_SECONDS)
            .post(body.toString().toRequestBody(JSON))
            .build()
    }

    private fun message(turn: TutorTurn): JsonObject = buildJsonObject {
        put("messageId", UUID.randomUUID().toString())
        put("role", "ROLE_USER")
        put("parts", parts(turn))
        turn.contextId?.let { put("contextId", it) }
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
        private const val PROTOCOL_VERSION = "1.0"
        private const val APP_CALLS = "appCalls"
        private const val UNANSWERED = "unanswered"
        private const val READ_SECONDS = 120L
        private const val RETRY_MS = 600L
        private val JSON = "application/json".toMediaType()
    }
}
