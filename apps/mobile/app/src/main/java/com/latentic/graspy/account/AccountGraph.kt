package com.latentic.graspy.account

import android.app.Application
import androidx.work.WorkManager
import com.latentic.graspy.auth.FirebaseSession
import com.latentic.graspy.auth.GoogleSignIn
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.retrofit
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.mcp.keptViewCalls
import com.latentic.graspy.sync.networkReach
import kotlinx.coroutines.flow.first
import okhttp3.OkHttpClient

/** The account's parts, made once per process. */
class AccountGraph(private val context: Application) {
    val accounts by lazy { AccountStore(context.getSharedPreferences(PreferenceFiles.ACCOUNT, 0)) }
    val profiles by lazy { LearnerProfileStore(context) }
    private val deviceIds by lazy { DeviceIdStore(context.getSharedPreferences(PreferenceFiles.DEVICE, 0)) }
    private val firebase by lazy { FirebaseSession() }

    /** The learner key of whoever the device learns as now, if anyone. */
    fun learnerInUse(): String? = accounts.account.value?.learnerKey

    /** False once the device has left [learnerKey]: its screens may still be up, but nothing starts for them. */
    fun learnsAs(learnerKey: String): Boolean = learnerInUse() == learnerKey

    /** The exchange sends no session of its own, so it goes around the session interceptor. */
    private val sessionApi: SessionApi by lazy { retrofit(OkHttpClient()).create(SessionApi::class.java) }

    val sessions: SessionTokens by lazy {
        SessionTokens(
            accounts = accounts,
            deviceId = deviceIds::current,
            idToken = firebase::idToken,
            exchange = sessionApi::session,
            learnerGone = { wipe.leaveLearner() },
            signedOutElsewhere = { entry.signOut() },
        )
    }

    val wipe by lazy {
        DeviceWipe(context, AppGraph.database(context), accounts, sessions, deviceIds, profiles) {
            WorkManager.getInstance(context).cancelAllWork()
        }
    }

    val deviceLearning by lazy { DeviceLearning(AppGraph.database(context), profiles) }

    private suspend fun online(): Boolean = networkReach(context).first()

    val outbox: Outbox by lazy {
        UnsentWork(
            online = ::online,
            outboxes = listOf(
                RecordingOutbox(AppGraph.database(context).submissionDao(), AppGraph.submissionRepository(context)),
                keptViewCalls(context),
            ),
        )
    }

    val choice by lazy {
        LearnerChoice(
            accounts = accounts,
            api = AppGraph.accountApi(context),
            sessions = sessions,
            deviceId = deviceIds::current,
            outbox = outbox,
            online = ::online,
            leaveLearner = wipe::leaveLearner,
            claimDeviceLearning = deviceLearning::claim,
        )
    }

    val directory by lazy {
        LearnerDirectory(AppGraph.accountApi(context), accounts, profiles, wipe::leaveLearner) { entry.signOut() }
    }

    val entry by lazy {
        AccountEntry(context, GoogleSignIn(context, firebase), firebase, accounts, sessions, sessionApi, deviceIds, wipe)
    }
}
