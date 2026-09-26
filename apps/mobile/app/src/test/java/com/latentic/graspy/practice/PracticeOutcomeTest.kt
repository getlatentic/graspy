package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.SubmissionEntity
import com.latentic.graspy.collection.outbox.SubmissionStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PracticeOutcomeTest {
    @Test
    fun `completed submission exposes transcript and deterministic result`() {
        val outcome = submission(
            transcript = "seven times eight na fifty six",
            parsedAnswer = 56,
            decision = "correct",
            feedback = "Correct",
        ).practiceOutcome()

        assertEquals("seven times eight na fifty six", outcome?.transcript)
        assertEquals(56, outcome?.parsedAnswer)
        assertEquals(PracticeDecision.CORRECT, outcome?.decision)
    }

    @Test
    fun `a completed table recitation exposes its fact-level result`() {
        val outcome = submission(
            transcript = "one times one is one",
            decision = "try_again",
            feedback = "You got 1 of 12.",
            resultJson = """{"correct_multipliers":[1],"missing_multipliers":[2],"incorrect_facts":[]}""",
        ).practiceOutcome()

        assertEquals(listOf(1), outcome?.recitation?.correctMultipliers)
        assertEquals(listOf(2), outcome?.recitation?.missingMultipliers)
    }

    @Test
    fun `an upload without an evaluated turn is not presented as tutoring feedback`() {
        assertNull(submission().practiceOutcome())
    }

    private fun submission(
        transcript: String? = null,
        parsedAnswer: Int? = null,
        decision: String? = null,
        feedback: String? = null,
        resultJson: String? = null,
    ) = SubmissionEntity(
        localId = "local",
        ownerId = "owner",
        participantId = "participant",
        idempotencyKey = "key",
        audioPath = "/tmp/audio.wav",
        speakerId = "speaker",
        languagePair = "yo-en",
        spokenLanguage = null,
        task = "reasoning",
        topic = "multiplication",
        promptId = "mul_7x8_explain",
        consentScope = "hackathon_evaluation",
        status = SubmissionStatus.COMPLETED.name,
        serverSampleId = "gvm_sample",
        uploadPath = null,
        failureReason = null,
        transcript = transcript,
        parsedAnswer = parsedAnswer,
        decision = decision,
        feedback = feedback,
        provider = if (transcript == null) null else "sahara",
        latencyMs = if (transcript == null) null else 17,
        resultJson = resultJson,
        attemptCount = 1,
        createdAtEpochMillis = 1,
    )
}
