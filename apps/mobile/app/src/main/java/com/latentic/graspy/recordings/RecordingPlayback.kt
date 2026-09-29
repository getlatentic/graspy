package com.latentic.graspy.recordings

import android.media.AudioAttributes
import android.media.MediaPlayer
import java.io.File
import java.io.IOException

/** Plays one recording at a time, from a file. */
interface RecordingPlayback {
    /** Ends any recording playing, and plays [file]; [onEnded] runs once when it finishes or cannot be played. */
    fun play(file: File, onEnded: () -> Unit)

    fun stop()
}

class MediaPlayerPlayback : RecordingPlayback {
    private var player: MediaPlayer? = null

    override fun play(file: File, onEnded: () -> Unit) {
        stop()
        val started = MediaPlayer()
        player = started
        started.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        started.setOnPreparedListener { it.start() }
        started.setOnCompletionListener { ended(it, onEnded) }
        started.setOnErrorListener { failed, _, _ ->
            ended(failed, onEnded)
            true
        }
        try {
            started.setDataSource(file.path)
            started.prepareAsync()
        } catch (unplayable: IOException) {
            ended(started, onEnded)
        }
    }

    override fun stop() {
        player?.let { release(it) }
        player = null
    }

    private fun ended(finished: MediaPlayer, onEnded: () -> Unit) {
        if (player === finished) player = null
        release(finished)
        onEnded()
    }

    private fun release(finished: MediaPlayer) {
        finished.setOnCompletionListener(null)
        finished.setOnErrorListener(null)
        finished.release()
    }
}
