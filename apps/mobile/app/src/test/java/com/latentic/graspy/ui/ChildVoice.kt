package com.latentic.graspy.ui

import android.media.AudioRecord
import java.util.concurrent.CountDownLatch
import org.robolectric.shadows.ShadowAudioRecord
import org.robolectric.shadows.ShadowAudioRecord.AudioRecordSourceProvider

private const val READ_PACE_MS = 20L
private const val LOUD: Byte = 0x60

/** A child who keeps talking: loud, so the take never ends itself, and paced as a microphone is. */
val speaking = AudioRecordSourceProvider {
    object : ShadowAudioRecord.AudioRecordSource {
        override fun readInByteArray(audioData: ByteArray, offsetInBytes: Int, sizeInBytes: Int, isBlocking: Boolean): Int {
            Thread.sleep(READ_PACE_MS)
            for (index in offsetInBytes until offsetInBytes + sizeInBytes step 2) {
                audioData[index] = 0
                audioData[index + 1] = if (index / 2 % 2 == 0) LOUD else (-LOUD).toByte()
            }
            return sizeInBytes
        }
    }
}

/**
 * A child speaking whose last words the microphone holds until [release]: once [holding], the take cannot finish
 * ending, so it is still being saved for as long as a test needs.
 */
class HeldVoice : AudioRecordSourceProvider {
    @Volatile var holding = false
    val release = CountDownLatch(1)

    override fun get(audioRecord: AudioRecord): ShadowAudioRecord.AudioRecordSource {
        val voice = speaking.get(audioRecord)
        return object : ShadowAudioRecord.AudioRecordSource {
            override fun readInByteArray(audioData: ByteArray, offsetInBytes: Int, sizeInBytes: Int, isBlocking: Boolean): Int {
                if (holding) release.await()
                return voice.readInByteArray(audioData, offsetInBytes, sizeInBytes, isBlocking)
            }
        }
    }
}
