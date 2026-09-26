package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.SubmissionEntity
import com.latentic.graspy.localization.LessonCopy
import com.latentic.graspy.collection.outbox.SubmissionStatus
import java.io.File

data class LessonTurn(
    val localId: String,
    val promptId: String,
    val task: String,
    val topic: String,
    val table: Int,
    val serverSampleId: String?,
    val status: SubmissionStatus,
    val audioPath: String,
    val recordedAtEpochMillis: Long,
    val seconds: Int,
    val outcome: PracticeOutcome?,
    val failureReason: String?,
    val feedbackHeard: Boolean = false,
    val resultAcknowledged: Boolean = false,
) {
    val exercise: PracticeExercise get() = PracticeExercise.fromPromptId(promptId, task, topic)
}

private fun tableOf(exercise: PracticeExercise): Int = when (exercise) {
    is PracticeExercise.FactAnswer -> exercise.table
    is PracticeExercise.TimesTableRecitation -> exercise.table
    else -> 0
}

fun SubmissionEntity.toLessonTurn(): LessonTurn = LessonTurn(
    localId = localId,
    promptId = requireNotNull(promptId),
    task = task,
    topic = topic,
    table = tableOf(PracticeExercise.fromPromptId(requireNotNull(promptId), task, topic)),
    serverSampleId = serverSampleId,
    status = if (status == SubmissionStatus.COMPLETED.name && practiceOutcome() == null)
        SubmissionStatus.FAILED else SubmissionStatus.valueOf(status),
    audioPath = audioPath,
    recordedAtEpochMillis = createdAtEpochMillis,
    seconds = wavSeconds(File(audioPath).length()),
    outcome = practiceOutcome(),
    failureReason = failureReason,
    feedbackHeard = feedbackHeard,
    resultAcknowledged = resultAcknowledged,
)

const val NO_SPEECH = "no_speech"

/** The teacher gave up on this note: it will never be marked, so the learner must record again. */
val LessonTurn.unmarked: Boolean get() = status == SubmissionStatus.FAILED
val LessonTurn.heardNoSpeech: Boolean get() = unmarked && failureReason == NO_SPEECH

/** What the teacher says about a note it could not mark, whatever stopped it. */
internal fun unmarkedText(lesson: LessonCopy, turn: LessonTurn): String =
    if (turn.heardNoSpeech) lesson.noSpeech
    else lesson.couldNotCheck

internal fun wavSeconds(bytes: Long, sampleRate: Int = 16_000, bytesPerSample: Int = 2): Int =
    if (bytes <= 44L) 0 else ((bytes - 44L) / (sampleRate * bytesPerSample)).toInt()

fun pendingLessonTurn(turns: List<LessonTurn>): LessonTurn? = turns.firstOrNull { !it.resultAcknowledged }
