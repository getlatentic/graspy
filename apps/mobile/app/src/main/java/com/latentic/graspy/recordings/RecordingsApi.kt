package com.latentic.graspy.recordings

import kotlinx.serialization.Serializable
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

/** A parent's consent to keep a learner's voice recordings, and when it was given. */
@Serializable
data class VoiceConsentDto(val noticeVersion: Int, val retentionDays: Int, val grantedAt: Long)

/** A recording graspy keeps for the learner until [expiresAt]. Times are milliseconds since the epoch. */
@Serializable
data class KeptRecordingDto(
    val id: String,
    val recordedAt: Long,
    val expiresAt: Long,
    /** The title of the lesson it was for, if it was for one. */
    val lesson: String? = null,
    val transcript: String? = null,
    /** Null for anything but the apps' own WAV. */
    val durationSeconds: Int? = null,
    val bytes: Long = 0,
)

/** One page of kept recordings, newest first; [nextBefore] is where the next page starts, null on the last. */
@Serializable
data class VoiceOverviewDto(
    val consent: VoiceConsentDto? = null,
    val recordings: List<KeptRecordingDto> = emptyList(),
    val nextBefore: Long? = null,
)

/** The days a parent chose, with the fresh sign-in that proves they are there. Printing it never shows the token. */
@Serializable
data class KeepRecordingsDto(val noticeVersion: Int, val retentionDays: Int, val firebaseIdToken: String) {
    override fun toString() = "KeepRecordingsDto(noticeVersion=$noticeVersion, retentionDays=$retentionDays)"
}

/** What one call deleted; while [more] is true, asking again deletes more. */
@Serializable
data class DeletedDto(val deleted: Int, val more: Boolean)

/**
 * A parent's say over a learner's voice recordings. Only the account's own session reaches these, for a learner
 * the account holds.
 */
interface RecordingsApi {
    @GET("api/account/learners/{id}/voice")
    suspend fun overview(@Path("id") id: String, @Query("before") before: Long? = null): VoiceOverviewDto

    @PUT("api/account/learners/{id}/voice/consent")
    suspend fun keep(@Path("id") id: String, @Body consent: KeepRecordingsDto): VoiceConsentDto

    /** With [deleteRecordings] it also deletes the kept ones, a call at a time. */
    @DELETE("api/account/learners/{id}/voice/consent")
    suspend fun stop(@Path("id") id: String, @Query("deleteRecordings") deleteRecordings: Boolean): DeletedDto

    @Streaming
    @GET("api/account/learners/{id}/voice/recordings/{sampleId}/audio")
    suspend fun audio(@Path("id") id: String, @Path("sampleId") sampleId: String): ResponseBody

    @DELETE("api/account/learners/{id}/voice/recordings/{sampleId}")
    suspend fun delete(@Path("id") id: String, @Path("sampleId") sampleId: String)

    @DELETE("api/account/learners/{id}/voice/recordings")
    suspend fun deleteAll(@Path("id") id: String): DeletedDto
}
