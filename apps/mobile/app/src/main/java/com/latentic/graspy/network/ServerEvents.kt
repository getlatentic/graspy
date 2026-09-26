package com.latentic.graspy.network

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okio.BufferedSource

private val eventJson = Json { ignoreUnknownKeys = true }
private const val HEARTBEAT = "ping"
private const val DONE = "[DONE]"

/** Reads server-sent events: each event's data as JSON, heartbeats skipped, `[DONE]` ending the stream. */
fun readServerEvents(source: BufferedSource, onEvent: (JsonObject) -> Unit) {
    val data = StringBuilder()
    var name = ""
    while (true) {
        val line = source.readUtf8Line() ?: break
        when {
            line.startsWith("event:") -> name = line.removePrefix("event:").trim()
            line.startsWith("data:") -> data.append(line.removePrefix("data:").trimStart()).append('\n')
            line.isEmpty() -> {
                val event = data.toString().trim()
                data.clear()
                val heartbeat = name == HEARTBEAT
                name = ""
                if (event == DONE) return
                if (event.isNotEmpty() && !heartbeat) parsed(event)?.let(onEvent)
            }
        }
    }
    data.toString().trim().takeIf { it.isNotEmpty() && it != DONE }?.let(::parsed)?.let(onEvent)
}

private fun parsed(event: String): JsonObject? = runCatching { eventJson.parseToJsonElement(event) as? JsonObject }.getOrNull()
