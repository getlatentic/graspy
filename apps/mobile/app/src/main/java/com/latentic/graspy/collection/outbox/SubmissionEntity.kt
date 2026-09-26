package com.latentic.graspy.collection.outbox

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/** One recorded answer. [ownerId] is the learner key of the learner who gave it. */
@Entity(tableName = "submissions")
data class SubmissionEntity(
    @PrimaryKey val localId: String,
    val ownerId: String?,
    val participantId: String,
    val idempotencyKey: String,
    val audioPath: String,
    val speakerId: String,
    val languagePair: String,
    val spokenLanguage: String?,
    val task: String,
    val topic: String,
    val promptId: String?,
    val consentScope: String,
    val status: String,
    val serverSampleId: String?,
    val uploadPath: String?,
    val failureReason: String?,
    val transcript: String?,
    val parsedAnswer: Int?,
    val decision: String?,
    val feedback: String?,
    val provider: String?,
    val latencyMs: Int?,
    val resultJson: String?,
    val attemptCount: Int,
    val createdAtEpochMillis: Long,
    @ColumnInfo(defaultValue = "0") val feedbackHeard: Boolean = false,
    @ColumnInfo(defaultValue = "0") val resultAcknowledged: Boolean = false,
    val planId: String? = null,
    val eventId: String? = null,
)
