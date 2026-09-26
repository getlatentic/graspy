package com.latentic.graspy.practice

import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecitationFeedbackTextTest {
    private fun recitation(table: Int, decision: PracticeDecision) = LessonTurn(
        localId = "a", promptId = "mul_table_${table}_recite_1_12", task = "recitation",
        topic = "multiplication", table = table,
        serverSampleId = "a", status = SubmissionStatus.COMPLETED, audioPath = "/tmp/a.wav",
        recordedAtEpochMillis = 1, seconds = 3,
        outcome = PracticeOutcome("", null, decision, "", "intron_sync", 10),
        failureReason = null,
    )

    @Test
    fun `the teacher names the table instead of showing a template placeholder`() {
        for (language in InterfaceLanguage.entries) {
            val copy = copyFor(language)
            for (decision in PracticeDecision.entries) {
                val spoken = feedbackText(copy, recitation(2, decision), decision)
                assertFalse("$language $decision leaked a placeholder: $spoken", spoken.contains("%1"))
            }
        }
        val unheard = feedbackText(
            copyFor(InterfaceLanguage.ENGLISH),
            recitation(7, PracticeDecision.NOT_UNDERSTOOD),
            PracticeDecision.NOT_UNDERSTOOD,
        )
        assertTrue(unheard, unheard.contains("seven"))
    }
}
