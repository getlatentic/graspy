package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LessonThreadTest {
    private val copy = copyFor(AppLanguage.ENGLISH)

    private fun turn(status: SubmissionStatus, reason: String? = null, decision: PracticeDecision? = null) = LessonTurn(
        localId = "l", promptId = "mul_table_1_recite_1_12", task = "reasoning", topic = "multiplication", table = 1,
        serverSampleId = "gvm_l", status = status, audioPath = "/tmp/l.wav",
        recordedAtEpochMillis = 0, seconds = 3,
        outcome = decision?.let { PracticeOutcome("one times one is one", null, it, "f", "intron_sync", 1) },
        failureReason = reason,
    )

    @Test
    fun `a note the teacher could never mark ends the turn instead of waiting forever`() {
        assertTrue(turn(SubmissionStatus.FAILED, "provider_failure").unmarked)
        assertFalse(turn(SubmissionStatus.PENDING).unmarked)
        assertFalse(turn(SubmissionStatus.UPLOADING).unmarked)
    }

    @Test
    fun `only a silent recording is treated as unheard, not every failure`() {
        assertTrue(turn(SubmissionStatus.FAILED, NO_SPEECH).heardNoSpeech)
        assertFalse(turn(SubmissionStatus.FAILED, "HTTP 502").heardNoSpeech)
        assertEquals(copy.lesson.couldNotCheck, unmarkedText(copy.lesson, turn(SubmissionStatus.FAILED, "HTTP 502")))
    }
}
