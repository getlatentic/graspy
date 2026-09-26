package com.latentic.graspy.collection.outbox

import android.app.Application
import android.content.Context
import androidx.room.Room
import androidx.work.WorkManager
import com.latentic.graspy.BuildConfig
import com.latentic.graspy.account.AccountApi
import com.latentic.graspy.ask.chatMigrations
import com.latentic.graspy.account.AccountGraph
import com.latentic.graspy.account.RequestLearner
import com.latentic.graspy.account.SessionInterceptor
import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.network.HttpStack
import com.latentic.graspy.network.ReadTimeoutInterceptor
import com.latentic.graspy.sync.LessonRefreshScheduler
import com.latentic.graspy.sync.WorkManagerLessonRefreshScheduler
import com.latentic.graspy.sync.lessonCacheMigrations
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object AppGraph {
    @Volatile
    private var databaseInstance: GraspyDatabase? = null

    @Volatile
    private var accountInstance: AccountGraph? = null

    @Volatile
    private var httpStackInstance: HttpStack? = null

    fun database(context: Context): GraspyDatabase = databaseInstance ?: synchronized(this) {
        databaseInstance ?: Room.databaseBuilder(
            context.applicationContext,
            GraspyDatabase::class.java,
            "graspy.db",
        ).addMigrations(*submissionMigrations, *lessonCacheMigrations, *chatMigrations).build().also { databaseInstance = it }
    }

    fun account(context: Context): AccountGraph = accountInstance ?: synchronized(this) {
        accountInstance ?: AccountGraph(context.applicationContext as Application).also { accountInstance = it }
    }

    /** Calls for one learner only: made as any other learner, they fail instead. */
    fun callsFor(context: Context, learnerKey: String): Call.Factory = Call.Factory { request ->
        httpStack(context).callFactory.newCall(
            request.newBuilder().tag(RequestLearner::class.java, RequestLearner(learnerKey)).build(),
        )
    }

    fun sampleApiFor(context: Context, learnerKey: String): SampleApi = api(callsFor(context, learnerKey))

    fun accountApi(context: Context): AccountApi = retrofit(httpStack(context).callFactory).create(AccountApi::class.java)

    suspend fun awaitTransport(context: Context) {
        httpStack(context).awaitReady()
    }

    private fun api(calls: Call.Factory): SampleApi = retrofit(calls).create(SampleApi::class.java)

    private fun httpStack(context: Context): HttpStack = httpStackInstance ?: synchronized(this) {
        httpStackInstance ?: HttpStack(context.applicationContext, authorisedClient(context)).also { httpStackInstance = it }
    }

    private fun authorisedClient(context: Context): OkHttpClient {
        val account = account(context)
        return OkHttpClient.Builder()
            .addInterceptor(ReadTimeoutInterceptor)
            .addInterceptor(SessionInterceptor(account.sessions, account::learnerInUse))
            .build()
    }

    fun lessonRefreshScheduler(context: Context): LessonRefreshScheduler =
        WorkManagerLessonRefreshScheduler(WorkManager.getInstance(context))

    fun submissionRepository(context: Context): SubmissionRepository = SubmissionRepository(
        dao = database(context).submissionDao(),
        scheduler = WorkManagerSubmissionScheduler(WorkManager.getInstance(context)),
    )
}

internal fun retrofit(calls: Call.Factory): Retrofit = Retrofit.Builder()
    .baseUrl(BuildConfig.API_BASE_URL)
    .callFactory(calls)
    .addConverterFactory(apiJson.asConverterFactory("application/json".toMediaType()))
    .build()

internal val apiJson = Json {
    explicitNulls = false
    ignoreUnknownKeys = true
}
