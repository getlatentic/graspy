package com.latentic.graspy.collection.outbox

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import com.latentic.graspy.ask.ChatDao
import com.latentic.graspy.ask.ChatMessageEntity
import com.latentic.graspy.ask.ChatThreadEntity
import com.latentic.graspy.ask.chatMigrations
import com.latentic.graspy.lesson.LessonCopyDao
import com.latentic.graspy.lesson.LessonCopyEntity
import com.latentic.graspy.lesson.lessonCopyMigrations
import com.latentic.graspy.mcp.KeptCallDao
import com.latentic.graspy.mcp.KeptCallEntity
import com.latentic.graspy.mcp.KeptViewDao
import com.latentic.graspy.mcp.KeptViewEntity
import com.latentic.graspy.mcp.keptViewMigrations
import com.latentic.graspy.sync.CatalogueLessonEntity
import com.latentic.graspy.sync.LessonCacheDao
import com.latentic.graspy.sync.LessonMoveEntity
import com.latentic.graspy.sync.lessonCacheMigrations

@Database(
    entities = [
        SubmissionEntity::class,
        CatalogueLessonEntity::class,
        LessonMoveEntity::class,
        ChatThreadEntity::class,
        ChatMessageEntity::class,
        KeptCallEntity::class,
        LessonCopyEntity::class,
        KeptViewEntity::class,
    ],
    version = 17,
    exportSchema = true,
)
abstract class GraspyDatabase : RoomDatabase() {
    abstract fun submissionDao(): SubmissionDao

    abstract fun lessonCacheDao(): LessonCacheDao

    abstract fun chatDao(): ChatDao

    abstract fun keptCallDao(): KeptCallDao

    abstract fun lessonCopyDao(): LessonCopyDao

    abstract fun keptViewDao(): KeptViewDao
}

/** Every step from each version a phone may hold to this one. */
val graspyMigrations: Array<Migration> = arrayOf(
    *submissionMigrations,
    *lessonCacheMigrations,
    *chatMigrations,
    *lessonCopyMigrations,
    *keptViewMigrations,
)
