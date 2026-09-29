package com.latentic.graspy.recordings

import com.latentic.graspy.account.CONSENT_NOTICE_VERSION
import com.latentic.graspy.auth.FreshSignIn
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Where a kept recording is held, only while it plays, under the cache directory. */
const val KEPT_RECORDINGS_DIRECTORY = "kept-recordings"

/** What the parent's screen asks of graspy about a learner's kept voice recordings, and the audio it fetches. */
class VoiceKeeping(private val api: RecordingsApi, private val cache: File) {
    suspend fun overview(learnerId: String, before: Long? = null): VoiceOverviewDto = api.overview(learnerId, before)

    /** The parent agreed, for [days], with a sign-in made just now. */
    suspend fun keep(learnerId: String, days: Int, signIn: FreshSignIn): VoiceConsentDto =
        api.keep(learnerId, KeepRecordingsDto(CONSENT_NOTICE_VERSION, days, signIn.idToken))

    /** Stops keeping recordings. With [deleteRecordings], asks again until none is left; returns how many went. */
    suspend fun stop(learnerId: String, deleteRecordings: Boolean): Int =
        untilDone { api.stop(learnerId, deleteRecordings) }

    suspend fun deleteOne(learnerId: String, recordingId: String) = api.delete(learnerId, recordingId)

    /** Asks again until none is left; returns how many went. */
    suspend fun deleteAll(learnerId: String): Int = untilDone { api.deleteAll(learnerId) }

    /**
     * The recording as a file in the cache, for the caller to play and delete. A file left by a screen that was
     * closed or killed while it played is removed by [forgetFetched].
     */
    suspend fun fetch(learnerId: String, recordingId: String): File = withContext(Dispatchers.IO) {
        cache.mkdirs()
        val file = File(cache, "${UUID.randomUUID()}.wav")
        try {
            api.audio(learnerId, recordingId).use { body -> file.outputStream().use { body.byteStream().copyTo(it) } }
            file
        } catch (failure: Throwable) {
            file.delete()
            throw failure
        }
    }

    fun forgetFetched() {
        cache.deleteRecursively()
    }

    /** A call that deleted nothing yet says more is kept would be asked for ever. */
    private suspend fun untilDone(call: suspend () -> DeletedDto): Int {
        var deleted = 0
        while (true) {
            val step = call()
            deleted += step.deleted
            if (!step.more) return deleted
            if (step.deleted == 0) throw IOException("graspy says more recordings are kept but deleted none")
        }
    }
}
