package com.latentic.graspy.ask

import java.util.UUID
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

internal val chatJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/**
 * One learner's conversations on this phone, kept until the phone takes another learner. What is said or changed
 * here is marked unsent until graspy has it for the learner's other devices ([ThreadSync]).
 */
class ChatStore(
    private val dao: ChatDao,
    private val ownerId: String,
    /** Finds and starts a conversation as one, so one taken in from another device meanwhile is found. */
    private val inOneTransaction: suspend (suspend () -> Unit) -> Unit = { it() },
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val keptNow = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    val threads: Flow<List<ChatThread>> = dao.threads(ownerId).map { rows -> rows.mapNotNull(::threadOf) }

    /** Tells each time something is kept that the learner's other devices have yet to be sent. */
    val kept: Flow<Unit> = keptNow

    fun messages(threadId: String): Flow<List<ChatMessage>> = dao.messages(ownerId, threadId).map { rows -> rows.map(::messageOf) }

    suspend fun messagesNow(threadId: String): List<ChatMessage> = dao.messagesNow(ownerId, threadId).map(::messageOf)

    suspend fun threadFor(scope: ThreadScope): ChatThread? = dao.threadFor(ownerId, scope.key)?.let(::threadOf)

    suspend fun ensureThread(scope: ThreadScope): ChatThread {
        threadFor(scope)?.let { return it }
        var thread: ChatThread? = null
        inOneTransaction {
            thread = threadFor(scope) ?: clock().let { now ->
                ChatThread("thread-$now-${UUID.randomUUID()}", scope, null, null, now, now).also { save(it) }
            }
        }
        return checkNotNull(thread)
    }

    /** The tutor's memory of the conversation, and its latest question. */
    suspend fun recordTurn(thread: ChatThread, agentContextId: String?, question: String) {
        save(thread.copy(agentContextId = agentContextId ?: thread.agentContextId, preview = question, updatedAt = clock()))
        keptNow.tryEmit(Unit)
    }

    suspend fun add(threadId: String, kind: MessageKind, content: String, metadata: MessageMetadata = MessageMetadata()): ChatMessage {
        val message = ChatMessage("msg-${clock()}-${UUID.randomUUID()}", threadId, kind, content, clock(), metadata)
        if (kind != MessageKind.FAILED) {
            dao.saveMessage(
                ChatMessageEntity(ownerId, message.id, threadId, kind.wire, content, message.timestamp, chatJson.encodeToString(MessageMetadata.serializer(), metadata)),
            )
            keptNow.tryEmit(Unit)
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
        row.metadataJson?.let(::readMetadata) ?: MessageMetadata(),
    )
}
