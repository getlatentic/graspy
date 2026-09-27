package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.VoiceRefusal
import org.junit.Assert.assertEquals
import org.junit.Test

class UploadFailurePolicyTest {
    @Test
    fun `server and rate-limit failures retry`() {
        listOf(408, 425, 429, 500, 502, 503, 504).forEach { status ->
            assertEquals("HTTP $status", UploadDisposition.RETRY, UploadFailurePolicy.forHttp(status, fromGraspy = true))
        }
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forNetwork())
    }

    @Test
    fun `client validation failures the voice API names are permanent`() {
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(400, fromGraspy = true))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(413, fromGraspy = true))
    }

    @Test
    fun `a 4xx without the voice API's own body is no answer, and the recording stays to go again`() {
        listOf(400, 401, 403, 404, 410, 413, 451).forEach { status ->
            assertEquals("HTTP $status", UploadDisposition.RETRY, UploadFailurePolicy.forHttp(status, fromGraspy = false))
        }
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(502, fromGraspy = false))
    }

    @Test
    fun `graspy refusing the session keeps the recording for when the session is sorted`() {
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(401, fromGraspy = true))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(403, fromGraspy = true))
    }

    @Test
    fun `a named refusal decides, whatever its status`() {
        assertEquals(UploadDisposition.WAIT_FOR_LEARNER, UploadFailurePolicy.forHttp(409, fromGraspy = true, VoiceRefusal.LEARNER_REQUIRED))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, fromGraspy = true, VoiceRefusal.AUDIO_NOT_READY))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, fromGraspy = true, VoiceRefusal.STEP_NOT_OFFERED))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, fromGraspy = true, VoiceRefusal.UNSUPPORTED_PROMPT))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, fromGraspy = true, VoiceRefusal.IDEMPOTENCY_CONFLICT))
    }
}
