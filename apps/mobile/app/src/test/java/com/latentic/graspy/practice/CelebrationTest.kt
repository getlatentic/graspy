package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.SubmissionStatus
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CelebrationTest {
    private fun turn(decision: PracticeDecision) = LessonTurn(
        localId = "a", promptId = "mul_fact_2x3_say", task = "reasoning", topic = "multiplication", table = 2,
        serverSampleId = "a", status = SubmissionStatus.COMPLETED, audioPath = "/tmp/a.wav",
        recordedAtEpochMillis = 1, seconds = 3,
        outcome = PracticeOutcome("six", 6, decision, "Correct", "intron_sync", 10),
        failureReason = null,
    )

    private fun result(turn: LessonTurn) = ClassroomState(
        key = turn.localId, step = ClassroomStep.RESULT, started = true, audioHeard = true, turn = turn,
    )

    @Test
    fun `a right answer is marked`() {
        assertTrue(result(turn(PracticeDecision.CORRECT)).celebratesAnswer())
    }

    @Test
    fun `a missed or unheard answer is never marked`() {
        assertFalse(result(turn(PracticeDecision.TRY_AGAIN)).celebratesAnswer())
        assertFalse(result(turn(PracticeDecision.NOT_UNDERSTOOD)).celebratesAnswer())
    }

    @Test
    fun `a recording the recognizer heard no speech in is never marked`() {
        val silent = turn(PracticeDecision.CORRECT)
            .copy(status = SubmissionStatus.FAILED, failureReason = NO_SPEECH, outcome = null)

        assertTrue(silent.heardNoSpeech)
        assertFalse(result(silent).celebratesAnswer())
    }

    @Test
    fun `only a result is marked, never a step still being taught or sent`() {
        val correct = turn(PracticeDecision.CORRECT)

        val unmarked = ClassroomStep.entries.filter { it != ClassroomStep.RESULT }
            .map { step -> result(correct).copy(step = step) }

        assertTrue(unmarked.none { it.celebratesAnswer() })
    }
}
