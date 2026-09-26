package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.ConsentDto
import com.latentic.graspy.collection.CreateSampleRequestDto
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SampleApiSerializationTest {
    @Test
    fun `optional sample fields are omitted instead of sent as null`() {
        val request = CreateSampleRequestDto(
            speakerId = "speaker-1",
            languagePair = "yo-en",
            spokenLanguage = "en",
            task = "reasoning",
            topic = "multiplication",
            promptId = "mul_7x8_explain",
            device = "android",
            noiseCondition = null,
            consent = ConsentDto(granted = true, scope = "hackathon_evaluation"),
        )

        val json = apiJson.encodeToString(request)

        assertTrue(json.contains("\"device\":\"android\""))
        assertTrue(json.contains("\"spoken_language\":\"en\""))
        assertTrue(json.contains("\"granted\":true"))
        assertFalse(json.contains("noise_condition"))
    }
}
