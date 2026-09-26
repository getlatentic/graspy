package com.latentic.graspy.collection.outbox

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
