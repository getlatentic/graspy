package com.latentic.graspy.ask

import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

private val metadataJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/** One learner's conversations on this phone, kept until the phone takes another learner. */
class ChatStore(private val dao: ChatDao, private val ownerId: String, private val clock: () -> Long = System::currentTimeMillis) {
    val threads: Flow<List<ChatThread>> = dao.threads(ownerId).map { rows -> rows.mapNotNull(::threadOf) }

    fun messages(threadId: String): Flow<List<ChatMessage>> = dao.messages(ownerId, threadId).map { rows -> rows.map(::messageOf) }

    suspend fun messagesNow(threadId: String): List<ChatMessage> = dao.messagesNow(ownerId, threadId).map(::messageOf)

    suspend fun threadFor(scope: ThreadScope): ChatThread? = dao.threadFor(ownerId, scope.key)?.let(::threadOf)

    suspend fun ensureThread(scope: ThreadScope): ChatThread = threadFor(scope) ?: clock().let { now ->
        ChatThread("thread-$now-${UUID.randomUUID()}", scope, null, null, now, now).also { save(it) }
    }

    /** The tutor's memory of the conversation, and its latest question. */
    suspend fun recordTurn(thread: ChatThread, agentContextId: String?, question: String) =
        save(thread.copy(agentContextId = agentContextId ?: thread.agentContextId, preview = question, updatedAt = clock()))

    suspend fun add(threadId: String, kind: MessageKind, content: String, metadata: MessageMetadata = MessageMetadata()): ChatMessage {
        val message = ChatMessage("msg-${clock()}-${UUID.randomUUID()}", threadId, kind, content, clock(), metadata)
        if (kind != MessageKind.FAILED) {
            dao.saveMessage(
                ChatMessageEntity(ownerId, message.id, threadId, kind.wire, content, message.timestamp, metadataJson.encodeToString(MessageMetadata.serializer(), metadata)),
            )
        }
        return message
    }

    private suspend fun save(thread: ChatThread) = dao.saveThread(
        ChatThreadEntity(
            ownerId, thread.id, thread.scope.key, scopeJson.encodeToString(ThreadScope.serializer(), thread.scope),
            thread.agentContextId, thread.preview, thread.createdAt, thread.updatedAt,
        ),
    )

    private fun threadOf(row: ChatThreadEntity): ChatThread? = runCatching {
        ChatThread(row.id, scopeJson.decodeFromString(ThreadScope.serializer(), row.scopeJson), row.agentContextId, row.preview, row.createdAt, row.updatedAt)
    }.getOrNull()

    private fun messageOf(row: ChatMessageEntity): ChatMessage = ChatMessage(
        row.id, row.threadId, MessageKind.of(row.type), row.content, row.timestamp,
        row.metadataJson?.let { runCatching { metadataJson.decodeFromString(MessageMetadata.serializer(), it) }.getOrNull() } ?: MessageMetadata(),
    )
}
