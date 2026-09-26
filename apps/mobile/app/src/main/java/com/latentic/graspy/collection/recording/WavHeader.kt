package com.latentic.graspy.collection.recording

import java.nio.ByteBuffer
import java.nio.ByteOrder

object WavHeader {
    private const val HEADER_BYTES = 44
    private const val CHANNELS: Short = 1
    private const val BITS_PER_SAMPLE: Short = 16

    fun pcm16Mono(dataBytes: Int, sampleRate: Int): ByteArray {
        require(dataBytes >= 0) { "dataBytes must not be negative" }
        require(sampleRate > 0) { "sampleRate must be positive" }
        val bytesPerSample = BITS_PER_SAMPLE / 8
        return ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray(Charsets.US_ASCII))
            putInt(dataBytes + HEADER_BYTES - 8)
            put("WAVE".toByteArray(Charsets.US_ASCII))
            put("fmt ".toByteArray(Charsets.US_ASCII))
            putInt(16)
            putShort(1)
            putShort(CHANNELS)
            putInt(sampleRate)
            putInt(sampleRate * CHANNELS * bytesPerSample)
            putShort((CHANNELS * bytesPerSample).toShort())
            putShort(BITS_PER_SAMPLE)
            put("data".toByteArray(Charsets.US_ASCII))
            putInt(dataBytes)
        }.array()
    }
}
