package com.latentic.graspy.account

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.robolectric.RuntimeEnvironment
import retrofit2.HttpException
import retrofit2.Response

const val UID = "uid-1"
const val DEVICE = "device-0001"
val ADA = LearnerDto(id = "aaaaaaaaaaaa", name = "Ada", createdAt = 1L)
val BAYO = LearnerDto(id = "bbbbbbbbbbbb", name = "Bayo", createdAt = 2L)

fun context(): Context = RuntimeEnvironment.getApplication()

fun accountStore(account: Account?): AccountStore =
    AccountStore(context().getSharedPreferences(PreferenceFiles.ACCOUNT, 0)).apply { set(account) }

fun signedIn(learner: LearnerDto?, deviceJoins: Boolean = learner == null) =
    Account(UID, "parent@example.com", learner?.let { ChosenLearner(it.id, it.name) }, deviceJoins)

fun issued(token: String, learner: LearnerDto?, expiresIn: Long = 43_200) =
    IssuedSessionDto(token = token, expiresIn = expiresIn, signedIn = true, learner = learner)

fun httpError(code: Int, body: String = "{}") = HttpException(
    Response.error<Unit>(code, body.toResponseBody("application/json".toMediaType())),
)

/** A session holder that never needs to exchange: tests that use it keep sessions themselves. */
fun heldSessions(accounts: AccountStore) = SessionTokens(
    accounts = accounts,
    deviceId = { DEVICE },
    idToken = { _, _ -> error("no exchange expected") },
    exchange = { error("no exchange expected") },
    learnerGone = {},
    signedOutElsewhere = {},
)

/** The account's learners as a server would keep them, recording each call. */
class FakeAccountApi(learners: List<LearnerDto> = listOf(ADA, BAYO)) : AccountApi {
    val calls = mutableListOf<String>()
    private val kept = learners.toMutableList()

    override suspend fun learners() = LearnersDto(kept.toList())

    override suspend fun add(learner: NewLearnerDto): LearnerDto {
        calls += "add:${learner.name}:${learner.guardian}"
        return LearnerDto("cccccccccccc", learner.name, 3L).also { kept += it }
    }

    override suspend fun rename(id: String, name: LearnerNameDto): LearnerDto {
        calls += "rename:$id:${name.name}"
        val renamed = kept.first { it.id == id }.copy(name = name.name)
        kept.replaceAll { if (it.id == id) renamed else it }
        return renamed
    }

    override suspend fun remove(id: String): LearnersDto {
        calls += "remove:$id"
        kept.removeAll { it.id == id }
        return LearnersDto(kept.toList())
    }

    override suspend fun session(id: String, chosen: ChosenLearnerDto): IssuedSessionDto {
        calls += "session:$id:${chosen.deviceId}"
        return issued("learner-token-$id", kept.first { it.id == id })
    }

    override suspend fun delete() {
        calls += "delete"
    }
}

/** Firebase for the Auth emulator's demo project, which holds no one: no call leaves the test. */
fun demoFirebase(): FirebaseApp = FirebaseApp.getApps(context()).firstOrNull()
    ?: FirebaseApp.initializeApp(context(), FirebaseOptions.Builder().setProjectId("demo-graspy").setApplicationId("1:0:android:0").setApiKey("demo-key").build())
