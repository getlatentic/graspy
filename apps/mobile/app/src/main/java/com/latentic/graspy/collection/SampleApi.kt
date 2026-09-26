package com.latentic.graspy.collection

import com.latentic.graspy.home.CatalogueDto
import com.latentic.graspy.practice.LessonMove
import com.latentic.graspy.practice.RecitationResult
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.http.Streaming
import retrofit2.http.PUT
import retrofit2.http.Url

@Serializable
data class ConsentDto(
    val granted: Boolean,
    val scope: String,
)

@Serializable
data class CreateSampleRequestDto(
    @SerialName("speaker_id") val speakerId: String,
    @SerialName("language_pair") val languagePair: String,
    @SerialName("spoken_language") val spokenLanguage: String? = null,
    /** The language the teacher marks the answer in and replies in; the server takes English without it. */
    @SerialName("lesson_language") val lessonLanguage: String,
    @SerialName("learner_class") val learnerClass: String? = null,
    val task: String,
    val topic: String,
    @SerialName("prompt_id") val promptId: String? = null,
    @SerialName("plan_id") val planId: String? = null,
    @SerialName("event_id") val eventId: String? = null,
    val device: String? = null,
    @SerialName("noise_condition") val noiseCondition: String? = null,
    val consent: ConsentDto,
)

@Serializable
data class CreatedSampleDto(
    @SerialName("sample_id") val sampleId: String,
    val state: String,
    @SerialName("upload_path") val uploadPath: String? = null,
)

@Serializable
data class ExerciseDto(
    val kind: String,
    val table: Int? = null,
    val from: Int? = null,
    val to: Int? = null,
)

@Serializable
data class EvaluatedSampleDto(
    @SerialName("sample_id") val sampleId: String,
    val state: String,
    val transcript: String? = null,
    @SerialName("parsed_answer") val parsedAnswer: Int? = null,
    val decision: String? = null,
    val feedback: String? = null,
    val provider: String? = null,
    @SerialName("latency_ms") val latencyMs: Int? = null,
    val exercise: ExerciseDto? = null,
    val result: RecitationResult? = null,
    @SerialName("spoken_language") val spokenLanguage: String? = null,
)

@Serializable
data class LessonMoveDto(val move: LessonMove, val revision: Long, val day: String)

@Serializable
data class LessonEventDto(
    @SerialName("plan_id") val planId: String,
    @SerialName("event_id") val eventId: String,
    @SerialName("learner_class") val learnerClass: String? = null,
)

/** Voice lessons for the learner the session names. */
interface SampleApi {
    @GET("api/voice/lesson")
    suspend fun lessonMove(
        @Query("learner_class") learnerClass: String,
        @Query("language") language: String,
        @Query("plan") planId: String?,
    ): LessonMoveDto

    @GET("api/voice/catalogue")
    suspend fun catalogue(@Query("learner_class") learnerClass: String, @Query("language") language: String): CatalogueDto

    @POST("api/voice/lesson/events")
    suspend fun lessonEventHeard(@Body event: LessonEventDto): LessonEventDto

    @Streaming
    @GET("api/voice/teacher-audio/{utteranceId}")
    suspend fun teacherAudio(
        @Path("utteranceId") utteranceId: String,
        @Query("language") language: String,
        @retrofit2.http.Header("If-None-Match") heldVersion: String? = null,
    ): retrofit2.Response<ResponseBody>

    /** The teacher's voice for what she said about one marked answer, in her own words. */
    @Streaming
    @GET("api/voice/samples/{sampleId}/reply-audio")
    suspend fun replyAudio(@Path("sampleId") sampleId: String): retrofit2.Response<ResponseBody>

    @POST("api/voice/samples")
    suspend fun createSample(
        @retrofit2.http.Header("Idempotency-Key") idempotencyKey: String,
        @Body request: CreateSampleRequestDto,
    ): CreatedSampleDto

    /** [uploadPath] is the path the server named for this sample's audio. */
    @PUT
    suspend fun uploadAudio(
        @Url uploadPath: String,
        @Body audio: RequestBody,
    ): CreatedSampleDto

    @POST("api/voice/samples/{sampleId}/evaluation")
    suspend fun evaluateSample(@Path("sampleId") sampleId: String): EvaluatedSampleDto
}
