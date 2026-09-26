package com.latentic.graspy.collection.recording

import com.latentic.graspy.collection.recording.SpeechEndpoint.State
import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechEndpointTest {
    private fun SpeechEndpoint.feed(level: Float, windows: Int): State {
        var state = state
        repeat(windows) { state = add(level) }
        return state
    }

    @Test
    fun `a quiet room is nothing heard after eight seconds`() {
        val endpoint = SpeechEndpoint()
        assertEquals(State.WAITING, endpoint.feed(0.1f, 79))
        assertEquals(State.NOTHING_HEARD, endpoint.add(0.1f))
    }

    @Test
    fun `a tap or cough is too short to start an answer`() {
        val endpoint = SpeechEndpoint()
        endpoint.feed(0.9f, 2)
        assertEquals(State.WAITING, endpoint.feed(0.1f, 5))
    }

    @Test
    fun `a breath in the middle does not end the answer`() {
        val endpoint = SpeechEndpoint()
        assertEquals(State.SPEAKING, endpoint.feed(0.7f, 10))
        endpoint.feed(0.1f, 8)
        assertEquals(State.SPEAKING, endpoint.feed(0.7f, 10))
    }

    @Test
    fun `a second of quiet after speaking ends the answer`() {
        val endpoint = SpeechEndpoint()
        endpoint.feed(0.7f, 10)
        assertEquals(State.SPEAKING, endpoint.feed(0.1f, 11))
        assertEquals(State.FINISHED, endpoint.add(0.1f))
    }

    @Test
    fun `speaking late still counts once it starts before the wait runs out`() {
        val endpoint = SpeechEndpoint()
        endpoint.feed(0.1f, 60)
        assertEquals(State.SPEAKING, endpoint.feed(0.7f, 3))
    }
}
