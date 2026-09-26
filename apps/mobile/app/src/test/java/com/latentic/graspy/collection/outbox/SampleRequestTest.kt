package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.CreateSampleRequestDto
import com.latentic.graspy.localization.AppLanguage
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** A recorded answer tells the server the lesson's language, or the teacher marks and replies in English. */
class SampleRequestTest {
    private val submission = SubmissionEntity(
        localId = "local-1", ownerId = "uid/ada", participantId = "p", idempotencyKey = "k", audioPath = "a.wav",
        speakerId = "speaker", languagePair = "yo-en", spokenLanguage = "yo", task = "reasoning", topic = "multiplication",
        promptId = "mul_7x8", consentScope = "voice_lesson", status = "queued", serverSampleId = null, uploadPath = null,
        failureReason = null, transcript = null, parsedAnswer = null, decision = null, feedback = null, provider = null,
        latencyMs = null, resultJson = null, attemptCount = 0, createdAtEpochMillis = 0, planId = "plan", eventId = "event",
    )

    @Test
    fun `every sample carries the learner's lesson language`() {
        AppLanguage.entries.forEach { language ->
            val metadata = apiJson.encodeToJsonElement(CreateSampleRequestDto.serializer(), sampleRequest(submission, "primary_3", language)).jsonObject

            assertEquals(language.code, metadata["lesson_language"]?.jsonPrimitive?.content)
        }
    }

    @Test
    fun `a Yoruba learner's answer is marked in Yoruba, whatever language it was spoken in`() {
        val metadata = apiJson.encodeToJsonElement(
            CreateSampleRequestDto.serializer(),
            sampleRequest(submission.copy(spokenLanguage = "en"), "primary_3", AppLanguage.YORUBA),
        ).jsonObject

        assertEquals("yo", metadata["lesson_language"]?.jsonPrimitive?.content)
        assertEquals("en", metadata["spoken_language"]?.jsonPrimitive?.content)
        assertEquals("voice_lesson", metadata["consent"]?.jsonObject?.get("scope")?.jsonPrimitive?.content)
    }
}
