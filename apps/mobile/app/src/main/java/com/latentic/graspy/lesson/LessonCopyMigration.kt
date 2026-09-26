package com.latentic.graspy.lesson

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Adds the lessons copied to the phone and the view documents they open in, so both open offline. */
private val MIGRATION_13_14 = object : Migration(13, 14) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS `lesson_copies` (`ownerId` TEXT NOT NULL, `planId` TEXT NOT NULL,
                `subjectSlug` TEXT NOT NULL, `topicIndex` INTEGER NOT NULL, `topic` TEXT NOT NULL,
                `cardJson` TEXT NOT NULL, `savedAt` INTEGER NOT NULL,
                PRIMARY KEY(`ownerId`, `planId`, `subjectSlug`, `topicIndex`, `topic`))""".trimIndent(),
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS `kept_views` (`uri` TEXT NOT NULL, `html` TEXT NOT NULL,
                `title` TEXT NOT NULL, `cspJson` TEXT, `permissionsJson` TEXT, PRIMARY KEY(`uri`))""".trimIndent(),
        )
    }
}

/** Names the lesson each copy holds, so a topic's lesson made anew is copied again. */
private val MIGRATION_14_15 = object : Migration(14, 15) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `lesson_copies` ADD COLUMN `lessonId` TEXT")
    }
}

val lessonCopyMigrations: Array<Migration> = arrayOf(MIGRATION_13_14, MIGRATION_14_15)
