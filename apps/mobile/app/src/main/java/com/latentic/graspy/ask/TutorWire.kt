package com.latentic.graspy.ask

import com.latentic.graspy.network.readServerEvents
import com.latentic.graspy.network.readTimeout
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import okhttp3.Call
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** The tutor could not be reached, or stopped before answering; [retryable] when trying again may help. */
open class TutorUnreachable(message: String, val retryable: Boolean) : IOException(message)

/** The server holds no chat of this id: the turn that was to begin it never arrived. */
class ChatNotFound : TutorUnreachable("The chat is not on the server", retryable = true)

/** The three requests a turn makes: the A2A message that begins it, the frames read from a cursor, and the stop. */
internal class TutorWire(private val calls: Call.Factory, private val endpoint: HttpUrl, private val chats: HttpUrl) {
    /** Sends the A2A message and reads its stream into [reader]; returns when the stream ends, finished or not. */
    suspend fun send(body: JsonObject, reader: TurnReader, opened: () -> Unit) {
        val request = Request.Builder()
            .url(endpoint)
            .header("Accept", "text/event-stream")
            .header("A2A-Version", PROTOCOL_VERSION)
            .readTimeout(A2A_READ_SECONDS)
            .post(body.toString().toRequestBody(JSON))
            .build()
        execute(request) { response ->
            opened()
            readServerEvents(response.body.source()) { event ->
                (event["error"] as? JsonObject)?.let { throw TutorUnreachable("The tutor refused: $it", retryable = false) }
                (event["result"] as? JsonObject)?.let(reader::read)
            }
        }
    }

    /** Reads the turn's frames after [after] for as long as the server keeps the request open (20 s at most). */
    suspend fun events(chat: String, turn: String, after: Long, opened: () -> Unit, onFrame: (TurnFrame) -> Unit) {
        val request = Request.Builder()
            .url(turnUrl(chat, turn, "events"))
            .header("Accept", "text/event-stream")
            .header("Last-Event-ID", after.toString())
            .readTimeout(EVENTS_READ_SECONDS)
            .build()
        execute(request, chatMayBeMissing = true) { response ->
            opened()
            readServerEvents(response.body.source()) { event -> parseFrame(event)?.let(onFrame) }
        }
    }

    /** True when the server has the stop: the turn then ends with the words it has. */
    suspend fun stop(chat: String, turn: String): Boolean {
        val request = Request.Builder().url(turnUrl(chat, turn, "stop")).post(ByteArray(0).toRequestBody()).build()
        return try {
            execute(request) { }
            true
        } catch (failure: TutorUnreachable) {
            false
        }
    }

    private fun turnUrl(chat: String, turn: String, last: String): HttpUrl =
        chats.newBuilder().addPathSegment(chat).addPathSegment("turns").addPathSegment(turn).addPathSegment(last).build()

    private suspend fun execute(request: Request, chatMayBeMissing: Boolean = false, read: (Response) -> Unit) = withContext(Dispatchers.IO) {
        val call = calls.newCall(request)
        val cancelled = currentCoroutineContext()[Job]?.invokeOnCompletion { if (it is CancellationException) call.cancel() }
        try {
            call.execute().use { response ->
                if (chatMayBeMissing && response.code == 404) throw ChatNotFound()
                if (!response.isSuccessful) throw TutorUnreachable("The tutor answered HTTP ${response.code}", response.code >= 500)
                read(response)
            }
        } catch (failure: TutorUnreachable) {
            throw failure
        } catch (failure: IOException) {
            currentCoroutineContext()[Job]?.let { if (it.isCancelled) throw CancellationException("The learner left the tutor") }
            throw TutorUnreachable(failure.message ?: "The tutor could not be reached", retryable = true)
        } finally {
            cancelled?.dispose()
        }
    }

    private companion object {
        const val PROTOCOL_VERSION = "1.0"
        const val A2A_READ_SECONDS = 120L
        // The server ends a read after 20 s; a longer silence is a connection that is no longer there.
        const val EVENTS_READ_SECONDS = 30L
        val JSON = "application/json".toMediaType()
    }
}
