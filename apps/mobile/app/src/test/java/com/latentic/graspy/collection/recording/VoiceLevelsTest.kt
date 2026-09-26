package com.latentic.graspy.collection.recording

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceLevelsTest {
    @Test
    fun `silence draws a flat wave`() {
        assertEquals(0f, loudness(0.0))
        assertEquals(0f, loudness(21.0))
    }

    @Test
    fun `speech at the mouth fills the wave`() {
        assertEquals(1f, loudness(Short.MAX_VALUE.toDouble()))
    }

    @Test
    fun `a voice at arm's length still shows`() {
        val near = loudness(3_000.0)
        val far = loudness(300.0)
        assertTrue("far voice should be visible, was $far", far > 0.2f)
        assertTrue("near voice should be louder than far", near > far)
    }

    @Test
    fun `the wave keeps only its newest readings`() {
        val levels = (1..VOICE_WAVE_BARS + 5).fold(emptyList<Float>()) { wave, step -> appendLevel(wave, step / 100f) }
        assertEquals(VOICE_WAVE_BARS, levels.size)
        assertEquals((VOICE_WAVE_BARS + 5) / 100f, levels.last())
        assertEquals(6 / 100f, levels.first())
    }

    @Test
    fun `readings outside the scale are clamped`() {
        assertEquals(listOf(1f, 0f), appendLevel(appendLevel(emptyList(), 3f), -1f))
    }
}
