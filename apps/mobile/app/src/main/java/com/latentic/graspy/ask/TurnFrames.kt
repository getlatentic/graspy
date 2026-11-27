package com.latentic.graspy.ask

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull

/** What a frame tells the learner's screen (apps/server/src/app/turns/frames.py). */
internal sealed interface TurnEvent {
    data class Text(val text: String) : TurnEvent

    data object RoundAborted : TurnEvent

    data class ToolStarted(val tool: String) : TurnEvent

    /** `ok`, `failed` or `stopped`; a reply is there for the first and last. */
    data class Finished(val status: String, val cause: String?, val answer: String?, val data: JsonObject?) : TurnEvent

    /** A frame the screen has no use for, which still has its place in the chat's order. */
    data object Passed : TurnEvent
}

internal sealed interface TurnFrame {
    /** The cursor is past the end of the chat: the chat was forgotten. */
    data object Reset : TurnFrame

    /** `seq` is the event's place in the chat, `prev` the seq of the frame before it (the cursor, for the first). */
    data class Placed(val seq: Long, val prev: Long, val event: TurnEvent) : TurnFrame
}

/** A frame, or null for what the server would not send: every field is read from the network. */
internal fun parseFrame(raw: JsonObject): TurnFrame? {
    if (raw.text("kind") == "reset") return TurnFrame.Reset
    val seq = raw.whole("seq") ?: return null
    val prev = raw.whole("prev") ?: return null
    return TurnFrame.Placed(seq, prev, eventOf(raw))
}

private fun eventOf(raw: JsonObject): TurnEvent = when (raw.text("kind")) {
    "text" -> raw.text("text")?.let(TurnEvent::Text) ?: TurnEvent.Passed
    "round.aborted" -> TurnEvent.RoundAborted
    "tool.started" -> raw.text("tool")?.let(TurnEvent::ToolStarted) ?: TurnEvent.Passed
    "turn.finished" -> finished(raw)
    else -> TurnEvent.Passed
}

private fun finished(raw: JsonObject): TurnEvent {
    val status = raw.text("status") ?: return TurnEvent.Passed
    val reply = raw["reply"] as? JsonObject
    return TurnEvent.Finished(status, raw.text("cause"), reply?.text("answer"), reply?.get("data") as? JsonObject)
}

private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content

private fun JsonObject.whole(key: String): Long? = (this[key] as? JsonPrimitive)?.takeUnless(JsonPrimitive::isString)?.longOrNull

internal enum class Taken { APPLY, SKIP, GAP, RESET }

/** What the screen has had of a turn: the seq of the last frame it applied. */
internal class TurnCursor {
    var at = 0L
        private set

    /** A frame at or below the cursor was had; one whose `prev` is not the cursor means a frame was lost. */
    fun take(frame: TurnFrame): Taken {
        if (frame !is TurnFrame.Placed) return Taken.RESET
        if (frame.seq <= at) return Taken.SKIP
        if (frame.prev != at) return Taken.GAP
        at = frame.seq
        return Taken.APPLY
    }
}
