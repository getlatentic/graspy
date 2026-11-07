package com.latentic.graspy.ask

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlin.math.min
import kotlin.random.Random

/** How long a run waits, so a test can run it without waiting. */
class Timing(
    /** The connection must stay down this long before the learner is told. */
    val showReconnectingAfterMs: Long = 1_200,
    /** A read that ends with nothing new is made again after this. */
    val readAgainMs: Long = 250,
    val backoffMs: (attempt: Int) -> Long = ::spreadBackoff,
    /** The server gives up on a turn ten minutes after it began. */
    val longestTurnMs: Long = 11 * 60 * 1000,
)

/** Doubling from a quarter second to five, spread so phones that lost the network together do not return together. */
fun spreadBackoff(attempt: Int): Long {
    val wait = min(250L shl (attempt - 1).coerceIn(0, 10), 5_000L)
    return (wait * (0.75 + Random.nextDouble() * 0.5)).toLong()
}

/**
 * One question to the tutor. Its chat and message id are fixed here, so every connection reads the same turn:
 * the A2A message begins it (sent again, the same id joins the turn it began), and a connection that drops is
 * followed from the last frame applied, by server-sent events with `Last-Event-ID`, as the web does (lib/chat-turn).
 */
class TutorRun internal constructor(
    private val wire: TutorWire,
    val chat: String,
    val messageId: String,
    private val message: JsonObject,
    private val timing: Timing,
) {
    /** Reads the turn to its end across connections that drop; the reply is the one an uncut turn gives. */
    suspend fun reply(listener: TurnListener): TutorReply = coroutineScope {
        val reading = Reading(TurnReader(chat, listener), Presence(this, listener, timing.showReconnectingAfterMs))
        try {
            reading.run()
        } finally {
            reading.presence.up()
        }
    }

    /** True when the server has the stop; the turn then ends with the words it has, and [reply] returns them. */
    suspend fun stop(): Boolean = wire.stop(chat, messageId)

    private inner class Reading(val reader: TurnReader, val presence: Presence) {
        private val cursor = TurnCursor()
        private var following = false
        private var failures = 0

        suspend fun run(): TutorReply {
            val deadline = System.currentTimeMillis() + timing.longestTurnMs
            while (true) {
                if (System.currentTimeMillis() > deadline) throw TutorUnreachable("The tutor stopped before answering", retryable = false)
                try {
                    if (if (following) follow() else send()) return reader.reply()
                } catch (failure: TutorUnreachable) {
                    if (!failure.retryable) throw failure
                    if (failure is ChatNotFound) following = false
                    waitToTryAgain()
                }
            }
        }

        /** True when the turn finished. A stream that ends or drops after it opened goes on as frames. */
        private suspend fun send(): Boolean {
            var opened = false
            try {
                wire.send(message, reader) {
                    opened = true
                    presence.up()
                }
            } catch (failure: TutorUnreachable) {
                if (!failure.retryable || !opened) throw failure
            }
            if (reader.finished) return true
            following = true
            reader.startOver()
            presence.down()
            return false
        }

        /** True when the turn finished. */
        private suspend fun follow(): Boolean {
            var applied = false
            wire.events(chat, messageId, cursor.at, opened = presence::up) { frame ->
                when (cursor.take(frame)) {
                    Taken.SKIP -> Unit
                    Taken.RESET -> throw TutorUnreachable("The chat is gone", retryable = false)
                    Taken.GAP -> throw TutorUnreachable("A frame was lost", retryable = true)
                    Taken.APPLY -> {
                        applied = true
                        failures = 0
                        presence.up()
                        apply(frame as TurnFrame.Placed)
                    }
                }
            }
            if (reader.finished) return true
            if (!applied) delay(timing.readAgainMs)
            return false
        }

        private fun apply(frame: TurnFrame.Placed) {
            when (val event = frame.event) {
                is TurnEvent.Text -> reader.delta(event.text)
                TurnEvent.RoundAborted -> reader.withdraw()
                is TurnEvent.ToolStarted -> reader.working(event.tool)
                is TurnEvent.Finished -> finish(event)
                TurnEvent.Passed -> Unit
            }
        }

        private fun finish(event: TurnEvent.Finished) {
            if (event.status != "ok" && event.status != "stopped") {
                throw TutorUnreachable("The tutor could not answer (${event.cause ?: event.status})", retryable = false)
            }
            reader.finish(event.answer.orEmpty(), event.data, byStop = event.status == "stopped")
        }

        private suspend fun waitToTryAgain() {
            failures += 1
            presence.down()
            delay(timing.backoffMs(failures))
        }
    }
}

/** Tells the learner the connection is down only when it stays down, not at a blink. */
private class Presence(private val scope: CoroutineScope, private val listener: TurnListener, private val afterMs: Long) {
    private var timer: Job? = null
    private var shown = false

    @Synchronized
    fun down() {
        if (timer != null || shown) return
        timer = scope.launch {
            delay(afterMs)
            show()
        }
    }

    @Synchronized
    private fun show() {
        if (timer == null) return
        timer = null
        shown = true
        listener.onReconnecting(true)
    }

    @Synchronized
    fun up() {
        timer?.cancel()
        timer = null
        if (!shown) return
        shown = false
        listener.onReconnecting(false)
    }
}
