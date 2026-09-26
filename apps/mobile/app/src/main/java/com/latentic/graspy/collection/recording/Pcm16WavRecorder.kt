package com.latentic.graspy.collection.recording

import android.Manifest
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.annotation.RequiresPermission
import com.latentic.graspy.collection.CompletedRecording
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext

class Pcm16WavRecorder(
    private val scope: CoroutineScope,
) {
    private val lock = Any()
    private var active: ActiveRecording? = null

    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    fun start(output: File, onLevel: (Float) -> Unit) {
        synchronized(lock) {
            check(active == null) { "a recording is already active" }
            output.parentFile?.mkdirs()
            val bufferSize = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            ).coerceAtLeast(SAMPLE_RATE)
            val recorder = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize,
            )
            check(recorder.state == AudioRecord.STATE_INITIALIZED) {
                recorder.release()
                "microphone recorder could not be initialized"
            }
            val capturing = AtomicBoolean(true)
            recorder.startRecording()
            val capture = scope.async(Dispatchers.IO) {
                writePcm(recorder, output, capturing, onLevel)
            }
            active = ActiveRecording(recorder, output, capturing, capture)
        }
    }

    suspend fun stop(): CompletedRecording {
        val recording = synchronized(lock) {
            checkNotNull(active) { "no recording is active" }.also { active = null }
        }
        recording.capturing.set(false)
        try {
            recording.recorder.stop()
            val signal = recording.capture.await()
            if (!signal.isAudible) {
                recording.output.delete()
                throw NoAudibleSpeechException()
            }
            return withContext(Dispatchers.IO) {
                val dataBytes = (recording.output.length() - HEADER_BYTES).coerceAtLeast(0)
                require(dataBytes <= Int.MAX_VALUE) { "recording is too large for WAV" }
                RandomAccessFile(recording.output, "rw").use { file ->
                    file.seek(0)
                    file.write(WavHeader.pcm16Mono(dataBytes.toInt(), SAMPLE_RATE))
                }
                CompletedRecording(recording.output.absolutePath)
            }
        } catch (error: Throwable) {
            recording.output.delete()
            throw error
        } finally {
            recording.recorder.release()
        }
    }

    fun cancel() {
        val recording = synchronized(lock) { active.also { active = null } } ?: return
        recording.capturing.set(false)
        runCatching { recording.recorder.stop() }
        recording.capture.cancel(CancellationException("recording owner was cleared"))
        recording.recorder.release()
        recording.output.delete()
    }

    /** Reads a tenth of a second at a time, so the voice wave moves with the child rather than in lurches. */
    private fun writePcm(
        recorder: AudioRecord,
        output: File,
        capturing: AtomicBoolean,
        onLevel: (Float) -> Unit,
    ): RecordedSignal {
        val buffer = ByteArray(LEVEL_WINDOW_BYTES)
        val signal = Pcm16Signal()
        FileOutputStream(output).use { stream ->
            stream.write(ByteArray(HEADER_BYTES))
            while (capturing.get()) {
                val bytesRead = recorder.read(buffer, 0, buffer.size)
                check(bytesRead >= 0) { "microphone read failed with code $bytesRead" }
                if (bytesRead > 0) {
                    stream.write(buffer, 0, bytesRead)
                    signal.add(buffer, bytesRead)
                    onLevel(loudness(Pcm16Signal().apply { add(buffer, bytesRead) }.result().rms))
                }
            }
        }
        return signal.result()
    }

    private data class ActiveRecording(
        val recorder: AudioRecord,
        val output: File,
        val capturing: AtomicBoolean,
        val capture: Deferred<RecordedSignal>,
    )

    companion object {
        const val SAMPLE_RATE = 16_000
        private const val HEADER_BYTES = 44
        private const val LEVEL_WINDOW_BYTES = SAMPLE_RATE / 10 * 2
    }
}

class NoAudibleSpeechException : RuntimeException("No audible speech was captured")

internal data class RecordedSignal(val sampleCount: Long, val squaredAmplitude: Double) {
    val rms: Double
        get() = if (sampleCount == 0L) 0.0 else sqrt(squaredAmplitude / sampleCount)

    val isAudible: Boolean
        get() = sampleCount > 0 && rms >= MINIMUM_AUDIBLE_RMS
}

internal class Pcm16Signal {
    private var sampleCount = 0L
    private var squaredAmplitude = 0.0

    fun add(bytes: ByteArray, length: Int) {
        var index = 0
        while (index + 1 < length) {
            val sample = ((bytes[index + 1].toInt() shl 8) or (bytes[index].toInt() and 0xff)).toShort().toInt()
            squaredAmplitude += sample.toDouble() * sample
            sampleCount++
            index += 2
        }
    }

    fun result() = RecordedSignal(sampleCount, squaredAmplitude)
}

private const val MINIMUM_AUDIBLE_RMS = 64.0
