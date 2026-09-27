package com.latentic.graspy.ask

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** A conversation, fixed to what it is about when it starts; a rebuilt plan is a new conversation. */
@Entity(tableName = "chat_threads", primaryKeys = ["ownerId", "id"], indices = [Index("ownerId", "scopeKey")])
data class ChatThreadEntity(
    val ownerId: String,
    val id: String,
    val scopeKey: String,
    val scopeJson: String,
    /** The A2A contextId of the tutor's memory, set by its first reply. */
    val agentContextId: String?,
    /** The learner's latest question. */
    val preview: String?,
    val createdAt: Long,
    val updatedAt: Long,
    /** Until graspy has it, for the learner's other devices. */
    @ColumnInfo(defaultValue = "1") val unsent: Boolean = true,
)

@Entity(tableName = "chat_messages", primaryKeys = ["ownerId", "id"], indices = [Index("ownerId", "threadId"), Index("ownerId", "unsent")])
data class ChatMessageEntity(
    val ownerId: String,
    val id: String,
    val threadId: String,
    /** "user", "system" for the tutor's reply, or "complete" for what the app did. */
    val type: String,
    val content: String,
    val timestamp: Long,
    /** As another device sent it, whatever of it this app reads. */
    val metadataJson: String?,
    /** When a view on another device last changed what the message shows; null until one did. */
    val editedAt: Long? = null,
    /** Until graspy has it, for the learner's other devices. */
    @ColumnInfo(defaultValue = "1") val unsent: Boolean = true,
) {
    val lastEdited: Long get() = editedAt ?: timestamp
}

/** Each learner's conversations, under their learner key. */
@Dao
interface ChatDao {
    @Query("SELECT * FROM chat_threads WHERE ownerId = :ownerId ORDER BY updatedAt DESC")
    fun threads(ownerId: String): Flow<List<ChatThreadEntity>>

    @Query("SELECT * FROM chat_threads WHERE ownerId = :ownerId AND scopeKey = :scopeKey LIMIT 1")
    suspend fun threadFor(ownerId: String, scopeKey: String): ChatThreadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveThread(thread: ChatThreadEntity)

    @Query("SELECT * FROM chat_messages WHERE ownerId = :ownerId AND threadId = :threadId ORDER BY timestamp, id")
    fun messages(ownerId: String, threadId: String): Flow<List<ChatMessageEntity>>

    @Query("SELECT * FROM chat_messages WHERE ownerId = :ownerId AND threadId = :threadId ORDER BY timestamp, id")
    suspend fun messagesNow(ownerId: String, threadId: String): List<ChatMessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveMessage(message: ChatMessageEntity)

    @Query("SELECT * FROM chat_messages WHERE ownerId = :ownerId AND id = :id")
    suspend fun message(ownerId: String, id: String): ChatMessageEntity?

    /** Threads to send: those changed here, and those holding a message said here. */
    @Query(
        """SELECT * FROM chat_threads WHERE ownerId = :ownerId AND (unsent = 1
           OR id IN (SELECT threadId FROM chat_messages WHERE ownerId = :ownerId AND unsent = 1))""",
    )
    suspend fun unsentThreads(ownerId: String): List<ChatThreadEntity>

    @Query("SELECT * FROM chat_messages WHERE ownerId = :ownerId AND unsent = 1 ORDER BY timestamp, id")
    suspend fun unsentMessages(ownerId: String): List<ChatMessageEntity>

    /** Only as it was sent: a thread changed since goes with the next send. */
    @Query(
        """UPDATE chat_threads SET unsent = 0 WHERE ownerId = :ownerId AND id = :id AND updatedAt = :updatedAt
           AND agentContextId IS :agentContextId AND preview IS :preview""",
    )
    suspend fun threadSent(ownerId: String, id: String, updatedAt: Long, agentContextId: String?, preview: String?)

    @Query("UPDATE chat_messages SET unsent = 0 WHERE ownerId = :ownerId AND id = :id AND COALESCE(editedAt, timestamp) = :editedAt")
    suspend fun messageSent(ownerId: String, id: String, editedAt: Long)
}
