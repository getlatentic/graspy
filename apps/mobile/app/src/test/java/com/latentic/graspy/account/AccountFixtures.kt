package com.latentic.graspy.account

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.latentic.graspy.auth.FirebaseSession
import java.io.IOException
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

    /** The status graspy refuses a learner's session with, if it does. */
    var sessionRefusedWith: Int? = null

    override suspend fun session(id: String, chosen: ChosenLearnerDto): IssuedSessionDto {
        calls += "session:$id:${chosen.deviceId}"
        sessionRefusedWith?.let { throw httpError(it) }
        return issued("learner-token-$id", kept.first { it.id == id })
    }

    override suspend fun delete() {
        calls += "delete"
    }
}

/** Firebase for the Auth emulator's demo project, which holds no one: no call leaves the test. */
fun demoFirebase(): FirebaseApp = FirebaseApp.getApps(context()).firstOrNull()
    ?: FirebaseApp.initializeApp(context(), FirebaseOptions.Builder().setProjectId("demo-graspy").setApplicationId("1:0:android:0").setApiKey("demo-key").build())

/** Each Google account forgotten, with the account on the phone then; [failing] as Play services not answering. */
class GoogleAccountForgets(private val accounts: AccountStore) {
    val forgotten = mutableListOf<Account?>()
    var failing = false

    fun forget() {
        if (failing) throw IOException("Play services did not answer")
        forgotten += accounts.account.value
    }
}

/** Firebase holding [uid]: the demo app never signs anyone in of its own. */
class FakeFirebase(google: GoogleAccountForgets) :
    FirebaseSession(FirebaseAuth.getInstance(demoFirebase()), { google.forget() }) {
    var uid: String? = null

    override val userId get() = uid

    override suspend fun idToken(uid: String, fresh: Boolean) = "id-token-$uid".takeIf { uid == this.uid }

    override fun signOut() {
        uid = null
    }
}

val noSessionApi = object : SessionApi {
    override suspend fun session(request: SessionRequestDto): IssuedSessionDto = error("No session is asked for")
}

/** What a sign-out has yet to forget and a sign-in has yet to undo, as the next start would find it. */
fun signOutPending(): Map<String, *> = context().getSharedPreferences(PreferenceFiles.SIGN_OUT, 0).all
