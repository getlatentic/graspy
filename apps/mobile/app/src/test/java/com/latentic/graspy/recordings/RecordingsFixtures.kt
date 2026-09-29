package com.latentic.graspy.recordings

import com.latentic.graspy.account.httpError
import java.io.File
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody
import okhttp3.ResponseBody.Companion.toResponseBody

const val LEARNER = "aaaaaaaaaaaa"

fun kept(id: String, recordedAt: Long, lesson: String? = null, seconds: Int? = 4) = KeptRecordingDto(
    id = id,
    recordedAt = recordedAt,
    expiresAt = recordedAt + 30 * DAY_MS,
    lesson = lesson,
    durationSeconds = seconds,
    bytes = 64_000,
)

const val DAY_MS = 24 * 60 * 60 * 1000L

/** graspy's parent routes for a learner's recordings, as apps/server keeps them, recording each call. */
class FakeRecordingsApi(recordings: List<KeptRecordingDto> = emptyList(), var consent: VoiceConsentDto? = null) : RecordingsApi {
    val calls = mutableListOf<String>()
    val kept = recordings.sortedByDescending { it.recordedAt }.toMutableList()

    /** How many recordings one page lists, and how many one delete removes before it says more is kept. */
    var pageSize = 100
    var deletesPerCall = Int.MAX_VALUE

    /** What each call is refused with, if it is. */
    var refusedWith: Throwable? = null

    /** The audio of every recording, or nothing for a recording that is gone. */
    var audio: ByteArray = "RIFFwav".toByteArray()

    /** Recordings past this many calls stay for ever, as if deleting them kept failing quietly. */
    var deletesNothing = false

    private fun refuse() {
        refusedWith?.let { throw it }
    }

    override suspend fun overview(id: String, before: Long?): VoiceOverviewDto {
        calls += "overview:$id:$before"
        refuse()
        val older = kept.sortedByDescending { it.recordedAt }.filter { before == null || it.recordedAt < before }
        val page = older.take(pageSize)
        return VoiceOverviewDto(consent, page, nextBefore = page.lastOrNull()?.recordedAt?.takeIf { older.size > page.size })
    }

    override suspend fun keep(id: String, consent: KeepRecordingsDto): VoiceConsentDto {
        calls += "keep:$id:${consent.noticeVersion}:${consent.retentionDays}:${consent.firebaseIdToken}"
        refuse()
        return VoiceConsentDto(consent.noticeVersion, consent.retentionDays, grantedAt = 7L).also { this.consent = it }
    }

    override suspend fun stop(id: String, deleteRecordings: Boolean): DeletedDto {
        calls += "stop:$id:$deleteRecordings"
        refuse()
        consent = null
        return if (deleteRecordings) deleteSome() else DeletedDto(0, more = false)
    }

    override suspend fun audio(id: String, sampleId: String): ResponseBody {
        calls += "audio:$id:$sampleId"
        refuse()
        if (kept.none { it.id == sampleId }) {
            throw httpError(404, """{"detail":{"error":"That recording is not kept","code":"recording_gone"}}""")
        }
        return audio.toResponseBody("audio/wav".toMediaType())
    }

    override suspend fun delete(id: String, sampleId: String) {
        calls += "delete:$id:$sampleId"
        refuse()
        kept.removeAll { it.id == sampleId }
    }

    override suspend fun deleteAll(id: String): DeletedDto {
        calls += "deleteAll:$id"
        refuse()
        return deleteSome()
    }

    private fun deleteSome(): DeletedDto {
        val going = if (deletesNothing) emptyList() else kept.take(deletesPerCall)
        kept.removeAll(going.toSet())
        return DeletedDto(going.size, more = kept.isNotEmpty())
    }
}

/** Plays nothing; finishes a recording when told to. */
class FakePlayback : RecordingPlayback {
    val played = mutableListOf<File>()
    /** What each file held when it was played, since it is deleted afterwards. */
    val heard = mutableListOf<ByteArray>()
    var stops = 0
    private var ended: (() -> Unit)? = null

    override fun play(file: File, onEnded: () -> Unit) {
        played += file
        heard += file.readBytes()
        ended = onEnded
    }

    override fun stop() {
        stops += 1
        ended = null
    }

    /** The recording plays to its end. */
    fun finish() = ended?.invoke()
}
