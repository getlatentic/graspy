package com.latentic.graspy.collection

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CollectionStateTest {
    @Test
    fun `upload is unavailable before consent`() {
        val state = CollectionState(recording = CompletedRecording("/tmp/sample.wav"))

        assertFalse(state.canUpload)
    }

    @Test
    fun `upload is unavailable before recording completes`() {
        val state = CollectionState(consent = Consent("hackathon_evaluation"))

        assertFalse(state.canUpload)
    }

    @Test
    fun `consent and completed recording make upload available`() {
        val state = CollectionState(
            consent = Consent("hackathon_evaluation"),
            recording = CompletedRecording("/tmp/sample.wav"),
        )

        assertTrue(state.canUpload)
    }
}

