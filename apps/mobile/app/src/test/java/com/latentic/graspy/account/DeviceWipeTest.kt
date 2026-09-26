package com.latentic.graspy.account

import android.os.Looper
import com.google.firebase.auth.FirebaseAuth
import com.latentic.graspy.auth.FirebaseSession
import com.latentic.graspy.auth.GoogleSignIn
import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.practice.TEACHER_AUDIO_DIRECTORY
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class DeviceWipeTest {
    private val context = context()
    private val database = inMemoryDatabase()
    private val accounts = accountStore(signedIn(ADA, deviceJoins = false))
    private val profiles = LearnerProfileStore(context)
    private val deviceIds = DeviceIdStore(context.getSharedPreferences(PreferenceFiles.DEVICE, 0))
    private var exchanges = 0
    private val sessions = SessionTokens(
        accounts = accounts,
        deviceId = deviceIds::current,
        idToken = { _, _ -> "google-id-token" },
        exchange = { exchanges += 1; issued("session-$exchanges", it.learnerId?.let { ADA }) },
        learnerGone = {},
        signedOutElsewhere = {},
    )
    private var workCancelled = false
    private var wipes = 0
    private var accountWhenWiped: Account? = null
    private val wipe = DeviceWipe(context, database, accounts, sessions, deviceIds, profiles) {
        workCancelled = true
        wipes += 1
        accountWhenWiped = accounts.account.value
    }
    private val firebase = FirebaseSession(FirebaseAuth.getInstance(demoFirebase()))
    private val unusedSessionApi = object : SessionApi {
        override suspend fun session(request: SessionRequestDto): IssuedSessionDto = error("No session is asked for")
    }
    private val ada = learnerKey(UID, ADA.id)
    private val bayo = learnerKey(UID, BAYO.id)
    private val adaProfile = LearnerProfile(SchoolClass.PRIMARY_3, AppLanguageSelection.YORUBA)
    private val bayoProfile = LearnerProfile(SchoolClass.JSS_1, AppLanguageSelection.PIDGIN)
    private val teacherAudio = File(context.cacheDir, TEACHER_AUDIO_DIRECTORY)
    private val recordings = File(context.filesDir, RECORDINGS_DIRECTORY)
    private lateinit var deviceId: String

    @Before
    fun learnerLearnedHere() = runBlocking {
        database.submissionDao().insert(answer("ada-1", ada))
        database.lessonCacheDao().replaceCatalogue(ada, "primary_3", listOf(storedLesson(ada)))
        database.lessonCacheDao().saveLessonMove(storedMove(ada))
        PreferenceFiles.learnerData.forEach { context.getSharedPreferences(it, 0).edit().putBoolean("kept", true).commit() }
        profiles.save(ada, adaProfile)
        profiles.save(bayo, bayoProfile)
        recordings.mkdirs()
        File(recordings, "ada-1.wav").writeText("RIFF")
        teacherAudio.mkdirs()
        listOf("en-prompt.audio", "en-prompt.audio.etag", "en-reply-gvm_1.audio").forEach { File(teacherAudio, it).writeText("audio") }
        sessions.token()
        deviceId = deviceIds.current()
    }

    @After
    fun close() = database.close()

    @Test
    fun `leaving a learner keeps nothing of theirs but their class and language`() = runBlocking {
        wipe.leaveLearner()

        assertLearnerDataGone()
        assertEquals(listOf("en-prompt.audio", "en-prompt.audio.etag"), teacherAudio.list()?.sorted())
        assertEquals(adaProfile, profiles.load(ada))
        assertEquals(bayoProfile, profiles.load(bayo))
        assertEquals(signedIn(learner = null, deviceJoins = false), accounts.account.value)
        assertEquals(deviceId, deviceIds.current())
        assertSessionForgotten()
    }

    @Test
    fun `the device lets the learner go before it wipes what they kept, so nothing still running writes after`() = runBlocking {
        wipe.leaveLearner()

        assertTrue(workCancelled)
        assertEquals(signedIn(null, deviceJoins = false), accountWhenWiped)
    }

    @Test
    fun `signing out lets the learner go first and the account last`() = runBlocking {
        wipe.wipeDevice()

        assertTrue(workCancelled)
        assertEquals(signedIn(learner = null, deviceJoins = false), accountWhenWiped)
        assertNull(accounts.account.value)
    }

    @Test
    fun `a sign-out cut short mid-wipe leaves the account, with no learner, for the next start`() = runBlocking {
        val killed = DeviceWipe(context, database, accounts, sessions, deviceIds, profiles) { error("The app was killed") }

        runCatching { killed.wipeDevice() }

        assertEquals(signedIn(learner = null, deviceJoins = false), accounts.account.value)
    }

    @Test
    fun `a sign-out asked for while one runs waits for it and wipes nothing more`() = runBlocking {
        val entry = AccountEntry(context, GoogleSignIn(context, firebase, "demo-client"), firebase, accounts, sessions, unusedSessionApi, deviceIds, wipe)
        val start = CoroutineScope(Dispatchers.IO + Job())

        repeat(2) { start.launch { entry.signOut() } }
        val deadline = System.currentTimeMillis() + 10_000
        while ((accounts.account.value != null || wipes == 0) && System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(10)
        }
        // Long enough for a second wipe to have begun, had the second sign-out not found nothing left to do.
        repeat(20) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(10)
        }
        start.cancel()

        assertNull(accounts.account.value)
        assertEquals(1, wipes)
    }

    @Test
    fun `a sign-out cut short, the account still here and Firebase signed out, is finished at the next start`() = runBlocking {
        val entry = AccountEntry(context, GoogleSignIn(context, firebase, "demo-client"), firebase, accounts, sessions, unusedSessionApi, deviceIds, wipe)
        val start = CoroutineScope(Dispatchers.IO + Job())

        entry.reconcile(start)
        // The sign-out's last step, forgetting the Google account, answers on the main thread this test holds and
        // never does under Robolectric: step the main thread until the account is gone, which is the wipe done.
        val deadline = System.currentTimeMillis() + 10_000
        while (accounts.account.value != null && System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(10)
        }
        start.cancel()

        assertLearnerDataGone()
        assertNull(profiles.load(ada))
        assertNull(accounts.account.value)
        assertNotEquals(deviceId, deviceIds.current())
    }

    @Test
    fun `signing out keeps nothing of the account or any learner, and the device takes a new id`() = runBlocking {
        wipe.wipeDevice()

        assertLearnerDataGone()
        assertFalse(teacherAudio.exists())
        assertNull(profiles.load(ada))
        assertNull(profiles.load(bayo))
        assertNull(accounts.account.value)
        assertNotEquals(deviceId, deviceIds.current())
        assertSessionForgotten()
    }

    private suspend fun assertLearnerDataGone() {
        assertTrue(workCancelled)
        assertEquals(emptyList<String>(), database.submissionDao().observeLessonTurns(ada).first().map { it.localId })
        assertEquals(emptyList<String>(), database.lessonCacheDao().observeCatalogue(ada, "primary_3").first().map { it.planId })
        assertNull(database.lessonCacheDao().observeLessonMove(ada, "primary_3").first())
        PreferenceFiles.learnerData.forEach { assertEquals(it, emptyMap<String, Any>(), context.getSharedPreferences(it, 0).all) }
        assertFalse(recordings.exists())
    }

    /** Last in a test: it signs the learner back in to see whether the old session is still held. */
    private suspend fun assertSessionForgotten() {
        val before = exchanges
        accounts.set(signedIn(ADA, deviceJoins = false))
        sessions.token()
        assertEquals("the held session was forgotten", before + 1, exchanges)
    }
}
