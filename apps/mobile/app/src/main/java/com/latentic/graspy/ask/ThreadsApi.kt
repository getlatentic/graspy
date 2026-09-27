package com.latentic.graspy.ask

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/** The conversations a learner's devices share (app/api/thread_routes.py), as the web reads and sends them. */
interface ThreadsApi {
    /** The seq graspy kept them under. */
    @POST("api/learner/threads")
    suspend fun keep(@Body sent: SentThreads): KeptThreads

    /** What changed since [since], a page at a time: [upTo] and [after] as the first page answered. */
    @GET("api/learner/threads")
    suspend fun changes(@Query("since") since: Long, @Query("upTo") upTo: Long? = null, @Query("after") after: String? = null): ThreadChanges
}
