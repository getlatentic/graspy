package com.latentic.graspy.collection.outbox

import androidx.room.Database
import androidx.room.RoomDatabase
import com.latentic.graspy.ask.ChatDao
import com.latentic.graspy.ask.ChatMessageEntity
import com.latentic.graspy.ask.ChatThreadEntity
import com.latentic.graspy.mcp.KeptCallDao
import com.latentic.graspy.mcp.KeptCallEntity
import com.latentic.graspy.sync.CatalogueLessonEntity
import com.latentic.graspy.sync.LessonCacheDao
import com.latentic.graspy.sync.LessonMoveEntity

@Database(
    entities = [
        SubmissionEntity::class,
        CatalogueLessonEntity::class,
        LessonMoveEntity::class,
        ChatThreadEntity::class,
        ChatMessageEntity::class,
        KeptCallEntity::class,
    ],
    version = 13,
    exportSchema = true,
)
abstract class GraspyDatabase : RoomDatabase() {
    abstract fun submissionDao(): SubmissionDao

    abstract fun lessonCacheDao(): LessonCacheDao

    abstract fun chatDao(): ChatDao

    abstract fun keptCallDao(): KeptCallDao
}
