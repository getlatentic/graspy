package com.latentic.graspy.account

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

@Serializable
data class LearnersDto(val learners: List<LearnerDto>)

/**
 * Whoever adds a learner confirms they are that learner, or their parent or guardian; a parent who has agreed to
 * graspy teaching the learner sends [consent] with them.
 */
@Serializable
data class NewLearnerDto(val name: String, val guardian: Boolean, val consent: ConsentProofDto? = null)

@Serializable
data class LearnerNameDto(val name: String)

/** The device's first choice after signing in names the device, so its own record joins the learner. */
@Serializable
data class ChosenLearnerDto(val deviceId: String? = null)

/** The signed-in account's learners. Any session of the account reaches these, whichever learner it names. */
interface AccountApi {
    @GET("api/account/learners")
    suspend fun learners(): LearnersDto

    @POST("api/account/learners")
    suspend fun add(@Body learner: NewLearnerDto): LearnerDto

    /** A parent's agreement to graspy teaching a learner already added. */
    @PUT("api/account/learners/{id}/consent")
    suspend fun agree(@Path("id") id: String, @Body consent: ConsentProofDto): ServiceConsentDto

    @PATCH("api/account/learners/{id}")
    suspend fun rename(@Path("id") id: String, @Body name: LearnerNameDto): LearnerDto

    /** Their plan, progress, lessons and voice lessons go with them. */
    @DELETE("api/account/learners/{id}")
    suspend fun remove(@Path("id") id: String): LearnersDto

    @POST("api/account/learners/{id}/session")
    suspend fun session(@Path("id") id: String, @Body chosen: ChosenLearnerDto): IssuedSessionDto

    /** Every learner and everything kept for them. The Google account stays Google's. */
    @DELETE("api/account")
    suspend fun delete()
}
