package com.latentic.graspy.account

import androidx.room.Room
import com.latentic.graspy.collection.outbox.GraspyDatabase
import com.latentic.graspy.collection.outbox.SubmissionEntity
import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.sync.CatalogueLessonEntity
import com.latentic.graspy.sync.LessonMoveEntity

fun inMemoryDatabase(): GraspyDatabase =
    Room.inMemoryDatabaseBuilder(context(), GraspyDatabase::class.java).allowMainThreadQueries().build()

fun answer(
    localId: String,
    ownerId: String?,
    status: SubmissionStatus = SubmissionStatus.PENDING,
    promptId: String = "plan.mathematics.table-2.ask",
) = SubmissionEntity(
    localId = localId,
    ownerId = ownerId,
    participantId = "participant",
    idempotencyKey = "key-$localId",
    audioPath = "/recordings/$localId.wav",
    speakerId = "participant",
    languagePair = "yo-en",
    spokenLanguage = null,
    task = "lesson",
    topic = "multiplication",
    promptId = promptId,
    consentScope = "voice_lesson",
    status = status.name,
    serverSampleId = null,
    uploadPath = null,
    failureReason = null,
    transcript = null,
    parsedAnswer = null,
    decision = null,
    feedback = null,
    provider = null,
    latencyMs = null,
    resultJson = null,
    attemptCount = 0,
    createdAtEpochMillis = localId.hashCode().toLong(),
    planId = "mathematics.table-2",
    eventId = "ask",
)

fun storedLesson(ownerId: String, planId: String = "mathematics.table-2") = CatalogueLessonEntity(
    ownerId = ownerId,
    learnerClass = "primary_3",
    planId = planId,
    position = 0,
    subject = "mathematics",
    topic = "multiplication",
    titleJson = """{"en":"The two times table"}""",
    standing = "started",
    daysCorrect = 0,
    current = true,
    day = "2026-09-26",
    fetchedAtEpochMillis = 1L,
)

fun storedMove(ownerId: String) = LessonMoveEntity(
    ownerId = ownerId,
    learnerClass = "primary_3",
    moveJson = "{}",
    revision = 1L,
    day = "2026-09-26",
    fetchedAtEpochMillis = 1L,
)
