package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.VoiceRefusal
import org.junit.Assert.assertEquals
import org.junit.Test

class UploadFailurePolicyTest {
    @Test
    fun `server and rate-limit failures retry within the attempt budget`() {
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(500, 0))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(429, 2))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forNetwork(3))
    }

    @Test
    fun `client validation failures are permanent`() {
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(400, 0))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(413, 0))
    }

    @Test
    fun `a named refusal decides, whatever its status`() {
        assertEquals(UploadDisposition.WAIT_FOR_LEARNER, UploadFailurePolicy.forHttp(409, 0, VoiceRefusal.LEARNER_REQUIRED))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(409, 0, VoiceRefusal.AUDIO_NOT_READY))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, 0, VoiceRefusal.STEP_NOT_OFFERED))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, 0, VoiceRefusal.UNSUPPORTED_PROMPT))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, 0, VoiceRefusal.IDEMPOTENCY_CONFLICT))
        assertEquals(
            UploadDisposition.PERMANENT_FAILURE,
            UploadFailurePolicy.forHttp(409, UploadFailurePolicy.MAX_ATTEMPTS - 1, VoiceRefusal.AUDIO_NOT_READY),
        )
    }

    @Test
    fun `transient failures stop retrying at the attempt limit`() {
        assertEquals(
            UploadDisposition.PERMANENT_FAILURE,
            UploadFailurePolicy.forHttp(503, UploadFailurePolicy.MAX_ATTEMPTS - 1),
        )
        assertEquals(
            UploadDisposition.PERMANENT_FAILURE,
            UploadFailurePolicy.forNetwork(UploadFailurePolicy.MAX_ATTEMPTS - 1),
        )
    }
}
