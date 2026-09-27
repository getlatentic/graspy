package com.latentic.graspy.ask

import com.latentic.graspy.mcp.ViewCard
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * A learner's conversations as their devices share them, as the web sends them (apps/web/src/lib/threads/
 * thread-wire.ts). graspy exports the shape to thread-contract.json, which the tests hold this file to.
 */
@Serializable
data class WireMessage(
    val id: String,
    /** "user", "system" or "complete", as [MessageKind] keeps it. */
    val type: String,
    val content: String,
    val timestamp: Long,
    val editedAt: Long,
    val metadata: JsonObject? = null,
)

@Serializable
data class WireThread(
    val id: String,
    val scope: JsonObject,
    val agentContextId: String? = null,
    val preview: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val messages: List<WireMessage> = emptyList(),
)

@Serializable
data class SentThreads(val threads: List<WireThread>)

@Serializable
data class KeptThreads(val seq: Long)

/** One page of what changed; threads and messages are read one by one, so one this app cannot read costs only itself. */
@Serializable
data class ThreadChanges(val upTo: Long, val threads: List<JsonElement> = emptyList(), val next: String? = null)

@Serializable
private data class ChangedThread(
    val id: String,
    val scope: JsonElement,
    val agentContextId: String? = null,
    val preview: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val messages: List<JsonElement> = emptyList(),
)

/** A thread another device sent, with what changed of it: not yet placed in this phone's copy. */
data class ReadThread(
    val id: String,
    val scope: ThreadScope,
    val agentContextId: String?,
    val preview: String?,
    val createdAt: Long,
    val updatedAt: Long,
    val messages: List<WireMessage>,
)

private val SENT_KINDS = setOf(MessageKind.LEARNER, MessageKind.TUTOR, MessageKind.DONE).map { it.wire }.toSet()

fun ChatMessageEntity.sent(): WireMessage = WireMessage(
    id = id,
    type = type,
    content = content,
    timestamp = timestamp,
    editedAt = lastEdited,
    metadata = metadataJson?.let { text -> runCatching { parseObject(text) }.getOrNull() }?.takeIf { it.isNotEmpty() },
)

fun ChatThreadEntity.sent(messages: List<ChatMessageEntity>): WireThread = WireThread(
    id = id,
    scope = parseObject(scopeJson),
    agentContextId = agentContextId,
    preview = preview,
    createdAt = createdAt,
    updatedAt = updatedAt,
    messages = messages.filter { it.type in SENT_KINDS }.map { it.sent() },
)

private fun parseObject(text: String): JsonObject = chatJson.parseToJsonElement(text).jsonObject

private fun readMessage(element: JsonElement): WireMessage? =
    runCatching { chatJson.decodeFromJsonElement(WireMessage.serializer(), element) }.getOrNull()?.takeIf { it.type in SENT_KINDS }

/** Null for a thread this app cannot place, such as one about something it does not know. */
fun readThread(element: JsonElement): ReadThread? {
    val changed = runCatching { chatJson.decodeFromJsonElement(ChangedThread.serializer(), element) }.getOrNull() ?: return null
    val scope = runCatching { scopeJson.decodeFromJsonElement(ThreadScope.serializer(), changed.scope) }.getOrNull() ?: return null
    return ReadThread(
        changed.id, scope, changed.agentContextId, changed.preview, changed.createdAt, changed.updatedAt,
        changed.messages.mapNotNull(::readMessage),
    )
}

/** Field by field, as another device may have written it: a part this app cannot read costs that part alone. */
fun readMetadata(text: String): MessageMetadata {
    val kept = runCatching { parseObject(text) }.getOrNull() ?: return MessageMetadata()
    fun <T> part(name: String, serializer: KSerializer<T>): T? =
        kept[name]?.let { runCatching { chatJson.decodeFromJsonElement(serializer, it) }.getOrNull() }
    return MessageMetadata(
        followUps = part("followUps", ListSerializer(String.serializer())).orEmpty(),
        card = part("card", ViewCard.serializer()),
        appCalls = part("appCalls", ListSerializer(JsonObject.serializer())).orEmpty(),
        link = part("link", ChatLink.serializer()),
        stopped = part("stopped", Boolean.serializer()) ?: false,
    )
}
