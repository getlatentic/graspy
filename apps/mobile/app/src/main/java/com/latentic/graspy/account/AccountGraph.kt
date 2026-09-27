package com.latentic.graspy.account

import android.app.Application
import androidx.work.WorkManager
import com.latentic.graspy.ask.keptThreads
import com.latentic.graspy.auth.FirebaseSession
import com.latentic.graspy.auth.GoogleSignIn
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.retrofit
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.mcp.keptViewCalls
import com.latentic.graspy.sync.networkReach
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
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
        accountSessions(accounts, deviceIds::current, firebase, sessionApi::session, { wipe }, { entry })
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
                keptThreads(context),
            ),
            sending = CoroutineScope(SupervisorJob() + Dispatchers.IO),
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

    val directory by lazy { accountDirectory(AppGraph.accountApi(context), accounts, profiles, { wipe }, { entry }) }

    val entry by lazy {
        AccountEntry(context, GoogleSignIn(context, firebase), firebase, accounts, sessions, sessionApi, deviceIds, wipe)
    }
}

/**
 * The device's sessions, wired to what a refusal asks for: a learner graspy no longer knows is left, and an
 * account Google no longer holds is signed out. Only that account: one signed in since its exchange began stays.
 */
fun accountSessions(
    accounts: AccountStore,
    deviceId: () -> String,
    firebase: FirebaseSession,
    exchange: suspend (SessionRequestDto) -> IssuedSessionDto,
    wipe: () -> DeviceWipe,
    entry: () -> AccountEntry,
) = SessionTokens(
    accounts = accounts,
    deviceId = deviceId,
    idToken = firebase::idToken,
    exchange = exchange,
    learnerGone = { wipe().leaveLearner() },
    signedOutElsewhere = { uid -> entry().signOut(of = uid) },
)

/**
 * The account's learners, wired to what removing one and deleting the account ask for: the learner in use is
 * left, and the account deleted is signed out. Only that account: one signed in since the delete began stays.
 */
fun accountDirectory(
    api: AccountApi,
    accounts: AccountStore,
    profiles: LearnerProfileStore,
    wipe: () -> DeviceWipe,
    entry: () -> AccountEntry,
) = LearnerDirectory(
    api = api,
    accounts = accounts,
    profiles = profiles,
    leaveLearner = { wipe().leaveLearner() },
    signOut = { uid -> entry().signOut(of = uid) },
)
