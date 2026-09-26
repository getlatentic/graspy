package com.latentic.graspy.practice

import android.content.Context
import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.collection.outbox.AppGraph
import java.io.File
import kotlinx.coroutines.withTimeout

class TeacherAudioRepository(
    context: Context,
    api: SampleApi,
) {
    private val applicationContext = context.applicationContext
    // The network stack is waited for only when a clip is actually fetched: one already on the phone
    // plays without it.
    private val cache = TeacherAudioCache(File(context.cacheDir, TEACHER_AUDIO_DIRECTORY)) { line, language, held ->
        AppGraph.awaitTransport(applicationContext)
        when (line) {
            is TeacherUtterance -> api.teacherAudio(line.wireValue, language, held)
            is TeacherReply -> api.replyAudio(line.sampleId)
        }
    }

    suspend fun prepare(line: TeacherLine, language: String): File =
        withTimeout(line.longestWait) { cache.prepare(line, language) }
}
