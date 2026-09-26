package com.latentic.graspy.collection

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** Each 409 as apps/server/src/app/voice/worker_evaluation.py, samples.py and the session guard send it. */
class VoiceRefusalTest {
    @Test
    fun `every voice refusal is told apart by its code`() {
        mapOf(
            "step_not_offered" to VoiceRefusal.STEP_NOT_OFFERED,
            "audio_not_ready" to VoiceRefusal.AUDIO_NOT_READY,
            "unsupported_prompt" to VoiceRefusal.UNSUPPORTED_PROMPT,
            "idempotency_conflict" to VoiceRefusal.IDEMPOTENCY_CONFLICT,
        ).forEach { (code, refusal) ->
            assertEquals(code, refusal, VoiceRefusal.of(conflict("""{"detail":"refused","code":"$code"}""")))
        }
    }

    @Test
    fun `a session with no learner is its own refusal, not a step never offered`() {
        val refused = conflict("""{"detail":{"error":"Choose a learner first","code":"learner_required"}}""")

        assertEquals(VoiceRefusal.LEARNER_REQUIRED, VoiceRefusal.of(refused))
    }

    @Test
    fun `the status alone names nothing`() {
        assertNull(VoiceRefusal.of(conflict("""{"detail":"that step was not offered to this learner"}""")))
        assertNull(VoiceRefusal.of(conflict("""{"detail":"transcription failed","code":"provider_failure"}""")))
    }

    @Test
    fun `reading the code leaves the body for the failure reason`() {
        val refused = conflict("""{"detail":"refused","code":"audio_not_ready"}""")

        VoiceRefusal.of(refused)

        assertEquals("""{"detail":"refused","code":"audio_not_ready"}""", refused.response()?.errorBody()?.string())
    }

    private fun conflict(body: String) = HttpException(
        Response.error<Unit>(409, body.toResponseBody("application/json".toMediaType())),
    )
}
