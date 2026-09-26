package com.latentic.graspy.collection.outbox

import androidx.room.Database
import androidx.room.RoomDatabase
import com.latentic.graspy.sync.CatalogueLessonEntity
import com.latentic.graspy.sync.LessonCacheDao
import com.latentic.graspy.sync.LessonMoveEntity

@Database(
    entities = [SubmissionEntity::class, CatalogueLessonEntity::class, LessonMoveEntity::class],
    version = 12,
    exportSchema = true,
)
abstract class GraspyDatabase : RoomDatabase() {
    abstract fun submissionDao(): SubmissionDao

    abstract fun lessonCacheDao(): LessonCacheDao
}
