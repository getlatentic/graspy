package com.latentic.graspy.sync

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Adds the learner's stored catalogue and current step. Recordings already on the phone are untouched. */
private val MIGRATION_9_10 = object : Migration(9, 10) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS `catalogue_lessons` (`ownerId` TEXT NOT NULL,
                `learnerClass` TEXT NOT NULL,
                `planId` TEXT NOT NULL,
                `position` INTEGER NOT NULL,
                `subject` TEXT NOT NULL,
                `topic` TEXT NOT NULL,
                `titleJson` TEXT NOT NULL,
                `standing` TEXT NOT NULL,
                `daysCorrect` INTEGER NOT NULL,
                `current` INTEGER NOT NULL,
                `day` TEXT NOT NULL,
                `fetchedAtEpochMillis` INTEGER NOT NULL,
                PRIMARY KEY(`ownerId`, `learnerClass`, `planId`))""".trimIndent(),
        )
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS `lesson_moves` (`ownerId` TEXT NOT NULL,
                `learnerClass` TEXT NOT NULL,
                `moveJson` TEXT NOT NULL,
                `revision` INTEGER NOT NULL,
                `day` TEXT NOT NULL,
                `fetchedAtEpochMillis` INTEGER NOT NULL,
                PRIMARY KEY(`ownerId`, `learnerClass`))""".trimIndent(),
        )
    }
}

/** Records which lessons the learner may open for themselves, as the Worker decides it. */
private val MIGRATION_10_11 = object : Migration(10, 11) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `catalogue_lessons` ADD COLUMN `openable` INTEGER NOT NULL DEFAULT 0")
    }
}

/** Every lesson opens on a tap, so which ones may be opened is no longer stored. */
private val MIGRATION_11_12 = object : Migration(11, 12) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE `catalogue_lessons_rebuilt` (`ownerId` TEXT NOT NULL,
                `learnerClass` TEXT NOT NULL,
                `planId` TEXT NOT NULL,
                `position` INTEGER NOT NULL,
                `subject` TEXT NOT NULL,
                `topic` TEXT NOT NULL,
                `titleJson` TEXT NOT NULL,
                `standing` TEXT NOT NULL,
                `daysCorrect` INTEGER NOT NULL,
                `current` INTEGER NOT NULL,
                `day` TEXT NOT NULL,
                `fetchedAtEpochMillis` INTEGER NOT NULL,
                PRIMARY KEY(`ownerId`, `learnerClass`, `planId`))""".trimIndent(),
        )
        db.execSQL(
            """INSERT INTO `catalogue_lessons_rebuilt`
               SELECT `ownerId`, `learnerClass`, `planId`, `position`, `subject`, `topic`,
                      `titleJson`, `standing`, `daysCorrect`, `current`, `day`, `fetchedAtEpochMillis`
               FROM `catalogue_lessons`""".trimIndent(),
        )
        db.execSQL("DROP TABLE `catalogue_lessons`")
        db.execSQL("ALTER TABLE `catalogue_lessons_rebuilt` RENAME TO `catalogue_lessons`")
    }
}

val lessonCacheMigrations: Array<Migration> = arrayOf(MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12)
