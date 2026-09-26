package com.latentic.graspy.plan

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class HeldPlan(val plan: JsonObject? = null)

@Serializable
data class TopicMark(
    val subjectSlug: String,
    val topicIndex: Int,
    val topic: String,
    val lessonId: String? = null,
    val learntAt: Long? = null,
)

@Serializable
data class RecordedAnswer(
    val subjectSlug: String? = null,
    val source: String,
    val correct: Boolean,
)

@Serializable
data class LearnerRecord(
    val topics: List<TopicMark> = emptyList(),
    val answers: List<RecordedAnswer> = emptyList(),
)

@Serializable
data class PathStep(val title: String, val level: String)

/** The topics from what a learner can study now to a goal they named. */
@Serializable
data class LearningPath(val subject: String, val goal: String, val steps: List<PathStep>)

@Serializable
data class SchoolStage(val id: String, val name: Names)

@Serializable
data class SchoolLevel(val id: String, val stage: String, val name: Names, val aliases: List<String> = emptyList(), val age: Int)

@Serializable
data class SchoolSystem(
    val id: String,
    val country: String,
    val name: Names,
    val main: Boolean = false,
    val stages: List<SchoolStage> = emptyList(),
    val levels: List<SchoolLevel> = emptyList(),
)

/** The plan and record endpoints the web uses (app/api/learner_routes.py, curriculum and education routes). */
interface PlanApi {
    @GET("api/learner/curriculum")
    suspend fun plan(): HeldPlan

    /** The server keeps the newer plan and returns it: another device's when that is newer. */
    @PUT("api/learner/curriculum")
    suspend fun keep(@Body plan: JsonObject): HeldPlan

    @GET("api/learner")
    suspend fun record(@Query("planId") planId: String): LearnerRecord

    /** A change to the record that a plan change brings: a subject dropped, or subjects carried to a new plan. */
    @POST("api/learner/plan")
    suspend fun changeRecord(@Body change: JsonObject): JsonObject

    @GET("api/curriculum/path")
    suspend fun path(
        @Query("country") country: String,
        @Query("language") language: String,
        @Query("goal") goal: String,
        @Query("gradeLevel") gradeLevel: String?,
    ): LearningPath

    /** The main system first. */
    @GET("api/education/countries/{country}")
    suspend fun schoolSystems(@Path("country") country: String): List<SchoolSystem>
}
