package com.latentic.graspy.lesson

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.latentic.graspy.plan.LessonTarget

/** A topic whose lesson has a copy on the phone, as the web keys its copies (lib/lesson-copies.ts). */
data class CopiedTopic(val planId: String, val subjectSlug: String, val topicIndex: Int, val topic: String)

val LessonTarget.copied: CopiedTopic get() = CopiedTopic(planId, subjectSlug, topicIndex, topic)

/** The lesson's view card as the server last gave it whole, to open with no connection. */
@Entity(tableName = "lesson_copies", primaryKeys = ["ownerId", "planId", "subjectSlug", "topicIndex", "topic"])
data class LessonCopyEntity(
    val ownerId: String,
    val planId: String,
    val subjectSlug: String,
    val topicIndex: Int,
    val topic: String,
    val cardJson: String,
    val savedAt: Long,
)

@Dao
interface LessonCopyDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun keep(copy: LessonCopyEntity)

    @Query(
        """SELECT cardJson FROM lesson_copies WHERE ownerId = :ownerId AND planId = :planId
           AND subjectSlug = :subjectSlug AND topicIndex = :topicIndex AND topic = :topic""",
    )
    suspend fun card(ownerId: String, planId: String, subjectSlug: String, topicIndex: Int, topic: String): String?

    @Query("SELECT planId, subjectSlug, topicIndex, topic FROM lesson_copies WHERE ownerId = :ownerId")
    suspend fun copied(ownerId: String): List<CopiedTopic>

    @Query(
        """DELETE FROM lesson_copies WHERE ownerId = :ownerId AND planId = :planId
           AND subjectSlug = :subjectSlug AND topicIndex = :topicIndex AND topic = :topic
           AND savedAt < :savedBefore""",
    )
    suspend fun drop(ownerId: String, planId: String, subjectSlug: String, topicIndex: Int, topic: String, savedBefore: Long)

    /** Only copies kept before [savedBefore]: one kept since is newer than whatever said to drop it. */
    @Transaction
    suspend fun dropAll(ownerId: String, topics: List<CopiedTopic>, savedBefore: Long) {
        topics.forEach { drop(ownerId, it.planId, it.subjectSlug, it.topicIndex, it.topic, savedBefore) }
    }
}
