package com.latentic.graspy.collection.recording

/** Loudness, on the voice wave's 0 to 1 scale, that counts as a voice rather than a room (about -35 dBFS). */
private const val SPEECH_LEVEL = 0.4f

/**
 * Where a child's answer starts and ends, judged from loudness alone, a tenth of a second at a time.
 *
 * No model and no network: the loudness is already measured for the voice wave. A cough or a tap is too
 * short to count as starting, a breath in the middle of "seven times eight... fifty six" is too short to
 * count as finishing, and a take in which nobody speaks at all is recognised as such, so it can be
 * dropped on the phone instead of uploading a room.
 */
class SpeechEndpoint(
    private val startWindows: Int = 3,
    private val endWindows: Int = 12,
    private val waitWindows: Int = 80,
) {
    enum class State { WAITING, SPEAKING, FINISHED, NOTHING_HEARD }

    var state = State.WAITING
        private set

    private var loudInARow = 0
    private var quietInARow = 0
    private var windows = 0

    fun add(level: Float): State {
        windows++
        val loud = level >= SPEECH_LEVEL
        when (state) {
            State.WAITING -> {
                loudInARow = if (loud) loudInARow + 1 else 0
                state = when {
                    loudInARow >= startWindows -> State.SPEAKING
                    windows >= waitWindows -> State.NOTHING_HEARD
                    else -> State.WAITING
                }
            }
            State.SPEAKING -> {
                quietInARow = if (loud) 0 else quietInARow + 1
                if (quietInARow >= endWindows) state = State.FINISHED
            }
            State.FINISHED, State.NOTHING_HEARD -> Unit
        }
        return state
    }
}
