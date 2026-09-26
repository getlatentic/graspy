package com.latentic.graspy.collection.recording

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Pcm16SignalTest {
    @Test
    fun `rejects the emulator noise floor as inaudible`() {
        assertFalse(signalWithAmplitude(21).isAudible)
    }

    @Test
    fun `accepts a quiet spoken recording`() {
        assertTrue(signalWithAmplitude(128).isAudible)
    }

    private fun signalWithAmplitude(amplitude: Short): RecordedSignal {
        val signal = Pcm16Signal()
        val bytes = ByteArray(320) { index ->
            if (index % 2 == 0) (amplitude.toInt() and 0xff).toByte() else (amplitude.toInt() shr 8).toByte()
        }
        signal.add(bytes, bytes.size)
        return signal.result()
    }
}
