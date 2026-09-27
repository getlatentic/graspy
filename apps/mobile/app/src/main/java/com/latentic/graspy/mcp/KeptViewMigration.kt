package com.latentic.graspy.mcp

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Names the sandbox each kept page opens in; a page kept before has none, and is kept again online. */
private val MIGRATION_16_17 = object : Migration(16, 17) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `kept_views` ADD COLUMN `sandbox` TEXT")
    }
}

val keptViewMigrations: Array<Migration> = arrayOf(MIGRATION_16_17)
