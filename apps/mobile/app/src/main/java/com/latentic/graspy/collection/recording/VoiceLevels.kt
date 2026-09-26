package com.latentic.graspy.collection.recording

import kotlin.math.log10

/** How many tenths of a second of loudness the voice wave shows at once. */
const val VOICE_WAVE_BARS = 28

private const val QUIET_DBFS = -55.0
private const val LOUD_DBFS = -6.0

/**
 * Microphone loudness from 0, a quiet room, to 1, a child speaking close to the phone.
 *
 * Decibels rather than raw amplitude, because a voice at arm's length is a tenth of the amplitude of
 * one at the mouth, and a linear scale would draw it as a flat line.
 */
internal fun loudness(rms: Double): Float {
    if (rms <= 0.0) return 0f
    val dbfs = 20 * log10(rms / Short.MAX_VALUE)
    return ((dbfs - QUIET_DBFS) / (LOUD_DBFS - QUIET_DBFS)).toFloat().coerceIn(0f, 1f)
}

/** The wave's history with one more reading: newest last, never longer than the wave. */
internal fun appendLevel(levels: List<Float>, level: Float): List<Float> =
    (levels + level.coerceIn(0f, 1f)).takeLast(VOICE_WAVE_BARS)
