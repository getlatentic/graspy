package com.latentic.graspy.ask

import java.util.concurrent.CopyOnWriteArrayList
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest

/** One event of a scripted turn: what the A2A stream sends, and the frame the chat keeps at [seq]. */
class Step(val a2a: String, val seq: Long, val kind: String, val fields: String = "")

/** What the server was asked, in order. */
class Asked(val method: String, val path: String, val lastEventId: String?, val body: String)

/**
 * A tutor that keeps one scripted turn. The A2A route sends the first [a2aEvents] events and ends the stream; the
 * events route sends the frames after the cursor, [framesPerRead] at most, as the server does for each read. The turn
 * exists on the server once the A2A message has arrived, as a chat is begun by its first turn.
 */
class ScriptedTurnServer(private val steps: List<Step>) {
    val server = MockWebServer()
    val asked = CopyOnWriteArrayList<Asked>()

    /** How many of the steps the A2A stream carries before it ends. */
    var a2aEvents = steps.size + 1

    /** Frames sent per read of the events route, or all. */
    var framesPerRead = Int.MAX_VALUE

    /** Each read begins with the last frame the client already had, as a server that was not sure of the cursor would. */
    var overlap = false

    /** The seq of a frame left out of the first read that reaches it. */
    var omitOnce: Long? = null

    /** How many of the first A2A messages reach the route but begin no turn: each is answered with an empty stream. */
    var silentMessages = 0

    /** A chat that already exists answers an empty stream for a turn it has not got, not a 404. */
    var knownChat = false

    private var begun = false

    /** The statuses the A2A route answers before it sends the stream. */
    val a2aFailures = ArrayDeque<Int>()

    /** The statuses the events route answers before it sends frames. */
    val eventsFailures = ArrayDeque<Int>()

    init {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                asked += Asked(request.method.orEmpty(), request.path.orEmpty(), request.getHeader("Last-Event-ID"), request.body.readUtf8())
                val path = request.path.orEmpty()
                return when {
                    path == "/a2a" -> a2a()
                    path.endsWith("/events") -> events(request.getHeader("Last-Event-ID")?.toLong() ?: 0)
                    path.endsWith("/stop") -> MockResponse().setResponseCode(204)
                    else -> MockResponse().setResponseCode(500)
                }
            }
        }
    }

    private fun a2a(): MockResponse {
        a2aFailures.removeFirstOrNull()?.let { return MockResponse().setResponseCode(it) }
        if (silentMessages > 0) {
            silentMessages -= 1
            return stream(emptyList(), 0)
        }
        begun = true
        return stream(listOf(TASK) + steps.map(Step::a2a), a2aEvents)
    }

    private fun events(after: Long): MockResponse {
        eventsFailures.removeFirstOrNull()?.let { return MockResponse().setResponseCode(it) }
        if (!begun) return if (knownChat) stream(emptyList(), 0) else MockResponse().setResponseCode(404)
        val skipped = lost()
        val firstNew = steps.indexOfFirst { it.seq > after }.let { if (it < 0) steps.size else it }
        val first = if (overlap) maxOf(firstNew - 1, 0) else firstNew
        val frames = (first until steps.size)
            .filter { steps[it].seq != skipped }
            .map { frame(it, if (it == first) (if (first == firstNew) after else steps[it - 1].seq) else steps[it - 1].seq) }
        return stream(frames, framesPerRead)
    }

    // A frame the server lost is left out of the first read that reaches it only.
    private fun lost(): Long {
        val seq = omitOnce ?: return -1
        omitOnce = null
        return seq
    }

    private fun frame(index: Int, prev: Long): String =
        """{"seq":${steps[index].seq},"prev":$prev,"kind":"${steps[index].kind}"${steps[index].fields}}"""

    private fun stream(events: List<String>, count: Int): MockResponse =
        MockResponse().setHeader("Content-Type", "text/event-stream").setBody(": open\n\n" + events.take(count).joinToString("") { "data: $it\n\n" })

    companion object {
        const val TASK = """{"result":{"task":{"id":"t","contextId":"chat-0001","status":{"state":"TASK_STATE_SUBMITTED"}}}}"""
    }
}
