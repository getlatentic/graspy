package com.latentic.graspy.ask

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Adds the learner's conversations with the tutor, and the view calls kept while there was no connection. */
private val MIGRATION_12_13 = object : Migration(12, 13) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS `chat_threads` (`ownerId` TEXT NOT NULL, `id` TEXT NOT NULL,
                `scopeKey` TEXT NOT NULL, `scopeJson` TEXT NOT NULL, `agentContextId` TEXT, `preview` TEXT,
                `createdAt` INTEGER NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`ownerId`, `id`))""".trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_chat_threads_ownerId_scopeKey` ON `chat_threads` (`ownerId`, `scopeKey`)")
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS `chat_messages` (`ownerId` TEXT NOT NULL, `id` TEXT NOT NULL,
                `threadId` TEXT NOT NULL, `type` TEXT NOT NULL, `content` TEXT NOT NULL, `timestamp` INTEGER NOT NULL,
                `metadataJson` TEXT, PRIMARY KEY(`ownerId`, `id`))""".trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_chat_messages_ownerId_threadId` ON `chat_messages` (`ownerId`, `threadId`)")
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS `kept_view_calls` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                `ownerId` TEXT NOT NULL, `name` TEXT NOT NULL, `argumentsJson` TEXT NOT NULL, `keptAt` INTEGER NOT NULL)""".trimIndent(),
        )
    }
}

/**
 * Marks each conversation and message until graspy has it, for the learner's other devices: what the phone kept
 * before is unsent, so it goes to the learner's account with the first sync.
 */
private val MIGRATION_15_16 = object : Migration(15, 16) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `chat_threads` ADD COLUMN `unsent` INTEGER NOT NULL DEFAULT 1")
        db.execSQL("ALTER TABLE `chat_messages` ADD COLUMN `editedAt` INTEGER")
        db.execSQL("ALTER TABLE `chat_messages` ADD COLUMN `unsent` INTEGER NOT NULL DEFAULT 1")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_chat_messages_ownerId_unsent` ON `chat_messages` (`ownerId`, `unsent`)")
    }
}

val chatMigrations: Array<Migration> = arrayOf(MIGRATION_12_13, MIGRATION_15_16)
