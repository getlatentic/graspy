package com.latentic.graspy.collection.outbox

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

private val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE submissions ADD COLUMN transcript TEXT")
        db.execSQL("ALTER TABLE submissions ADD COLUMN parsedAnswer INTEGER")
        db.execSQL("ALTER TABLE submissions ADD COLUMN decision TEXT")
        db.execSQL("ALTER TABLE submissions ADD COLUMN feedback TEXT")
        db.execSQL("ALTER TABLE submissions ADD COLUMN provider TEXT")
        db.execSQL("ALTER TABLE submissions ADD COLUMN latencyMs INTEGER")
    }
}

private val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE submissions ADD COLUMN resultJson TEXT")
    }
}

private val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE submissions ADD COLUMN spokenLanguage TEXT")
    }
}

private val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE submissions ADD COLUMN feedbackHeard INTEGER NOT NULL DEFAULT 0")
    }
}

private val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE submissions ADD COLUMN nextMoveJson TEXT")
        db.execSQL("ALTER TABLE submissions ADD COLUMN moveHeard INTEGER NOT NULL DEFAULT 0")
    }
}

private val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS `submissions_updated` (`localId` TEXT NOT NULL,
                `participantId` TEXT NOT NULL,
                `idempotencyKey` TEXT NOT NULL,
                `audioPath` TEXT NOT NULL,
                `speakerId` TEXT NOT NULL,
                `languagePair` TEXT NOT NULL,
                `spokenLanguage` TEXT,
                `task` TEXT NOT NULL,
                `topic` TEXT NOT NULL,
                `promptId` TEXT,
                `consentScope` TEXT NOT NULL,
                `status` TEXT NOT NULL,
                `serverSampleId` TEXT,
                `uploadPath` TEXT,
                `failureReason` TEXT,
                `transcript` TEXT,
                `parsedAnswer` INTEGER,
                `decision` TEXT,
                `feedback` TEXT,
                `provider` TEXT,
                `latencyMs` INTEGER,
                `resultJson` TEXT,
                `attemptCount` INTEGER NOT NULL,
                `createdAtEpochMillis` INTEGER NOT NULL,
                `feedbackHeard` INTEGER NOT NULL DEFAULT 0,
                `resultAcknowledged` INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(`localId`))
        """.trimIndent())
        db.execSQL("""
            INSERT INTO submissions_updated (`localId`,
                `participantId`,
                `idempotencyKey`,
                `audioPath`,
                `speakerId`,
                `languagePair`,
                `spokenLanguage`,
                `task`,
                `topic`,
                `promptId`,
                `consentScope`,
                `status`,
                `serverSampleId`,
                `uploadPath`,
                `failureReason`,
                `transcript`,
                `parsedAnswer`,
                `decision`,
                `feedback`,
                `provider`,
                `latencyMs`,
                `resultJson`,
                `attemptCount`,
                `createdAtEpochMillis`,
                `feedbackHeard`,
                `resultAcknowledged`) SELECT `localId`,
                `participantId`,
                `idempotencyKey`,
                `audioPath`,
                `speakerId`,
                `languagePair`,
                `spokenLanguage`,
                `task`,
                `topic`,
                `promptId`,
                `consentScope`,
                `status`,
                `serverSampleId`,
                `uploadPath`,
                `failureReason`,
                `transcript`,
                `parsedAnswer`,
                `decision`,
                `feedback`,
                `provider`,
                `latencyMs`,
                `resultJson`,
                `attemptCount`,
                `createdAtEpochMillis`,
                `feedbackHeard`,
                `feedbackHeard` FROM submissions
        """.trimIndent())
        db.execSQL("DROP TABLE submissions")
        db.execSQL("ALTER TABLE submissions_updated RENAME TO submissions")
    }
}


private val MIGRATION_7_8 = object : Migration(7, 8) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE submissions ADD COLUMN ownerId TEXT")
    }
}

private val MIGRATION_8_9 = object : Migration(8, 9) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE submissions ADD COLUMN planId TEXT")
        db.execSQL("ALTER TABLE submissions ADD COLUMN eventId TEXT")
    }
}

val submissionMigrations: Array<Migration> = arrayOf(
    MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7,
    MIGRATION_7_8, MIGRATION_8_9,
)
