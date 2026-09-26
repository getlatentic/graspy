package com.latentic.graspy.ask

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
)

@Entity(tableName = "chat_messages", primaryKeys = ["ownerId", "id"], indices = [Index("ownerId", "threadId")])
data class ChatMessageEntity(
    val ownerId: String,
    val id: String,
    val threadId: String,
    /** "user", "system" for the tutor's reply, or "complete" for what the app did. */
    val type: String,
    val content: String,
    val timestamp: Long,
    val metadataJson: String?,
)

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
}
