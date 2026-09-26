package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.VoiceRefusal
import org.junit.Assert.assertEquals
import org.junit.Test

class UploadFailurePolicyTest {
    @Test
    fun `server and rate-limit failures retry within the attempt budget`() {
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(500, 0, fromGraspy = true))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(429, 2, fromGraspy = true))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forNetwork(3))
    }

    @Test
    fun `client validation failures the voice API names are permanent`() {
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(400, 0, fromGraspy = true))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(413, 0, fromGraspy = true))
    }

    @Test
    fun `a 4xx without the voice API's own body is no answer, and the recording stays to go again`() {
        listOf(400, 404, 410, 413, 451).forEach { status ->
            assertEquals("HTTP $status", UploadDisposition.RETRY, UploadFailurePolicy.forHttp(status, 0, fromGraspy = false))
        }
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(502, 0, fromGraspy = false))
    }

    @Test
    fun `a named refusal decides, whatever its status`() {
        assertEquals(UploadDisposition.WAIT_FOR_LEARNER, UploadFailurePolicy.forHttp(409, 0, fromGraspy = true, VoiceRefusal.LEARNER_REQUIRED))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(409, 0, fromGraspy = true, VoiceRefusal.AUDIO_NOT_READY))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, 0, fromGraspy = true, VoiceRefusal.STEP_NOT_OFFERED))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, 0, fromGraspy = true, VoiceRefusal.UNSUPPORTED_PROMPT))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, 0, fromGraspy = true, VoiceRefusal.IDEMPOTENCY_CONFLICT))
        assertEquals(
            UploadDisposition.PERMANENT_FAILURE,
            UploadFailurePolicy.forHttp(409, UploadFailurePolicy.MAX_ATTEMPTS - 1, fromGraspy = true, VoiceRefusal.AUDIO_NOT_READY),
        )
    }

    @Test
    fun `transient failures stop retrying at the attempt limit`() {
        assertEquals(
            UploadDisposition.PERMANENT_FAILURE,
            UploadFailurePolicy.forHttp(503, UploadFailurePolicy.MAX_ATTEMPTS - 1, fromGraspy = true),
        )
        assertEquals(
            UploadDisposition.PERMANENT_FAILURE,
            UploadFailurePolicy.forNetwork(UploadFailurePolicy.MAX_ATTEMPTS - 1),
        )
    }
}
