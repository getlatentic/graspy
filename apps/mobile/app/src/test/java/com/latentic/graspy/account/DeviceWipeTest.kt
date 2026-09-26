package com.latentic.graspy.account

import com.google.firebase.auth.FirebaseAuth
import com.latentic.graspy.auth.FirebaseSession
import com.latentic.graspy.auth.GoogleAccountSheet
import com.latentic.graspy.auth.SignInOutcome
import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import com.latentic.graspy.lesson.CopiedTopic
import com.latentic.graspy.lesson.LessonCopyEntity
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.practice.TEACHER_AUDIO_DIRECTORY
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
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
    private var pendingWhenWiped: Map<String, *>? = null
    private val wipe = DeviceWipe(context, database, accounts, sessions, deviceIds, profiles) {
        workCancelled = true
        wipes += 1
        accountWhenWiped = accounts.account.value
        pendingWhenWiped = signOutPending
    }
    /** The account on the phone each time the Google account was forgotten. */
    private val forgotten = mutableListOf<Account?>()
    private var forgettingFails = false
    private val firebase = FirebaseSession(FirebaseAuth.getInstance(demoFirebase())) {
        if (forgettingFails) throw IOException("Play services did not answer")
        forgotten += accounts.account.value
    }
    private val signOutPending get() = context.getSharedPreferences(PreferenceFiles.SIGN_OUT, 0).all

    /** For each sign-in, whether the sheet was told to ask which account, and how many forgets came before it. */
    private val sheetAsked = mutableListOf<Pair<Boolean, Int>>()
    private val sheet = GoogleAccountSheet { askWhichAccount ->
        sheetAsked += askWhichAccount to forgotten.size
        SignInOutcome.Cancelled
    }
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
        database.lessonCopyDao().keep(LessonCopyEntity(ada, "plan-1", "mathematics", 1, "Fractions", "{}", savedAt = 1))
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
        val entry = entry(wipe)
        val start = CoroutineScope(Dispatchers.IO + Job())

        repeat(2) { start.launch { entry.signOut() } }
        start.coroutineContext[Job]!!.children.forEach { it.join() }

        assertNull(accounts.account.value)
        assertEquals(1, wipes)
    }

    @Test
    fun `a sign-out cut short, the account still here and Firebase signed out, is finished at the next start`() = runBlocking {
        val entry = entry(wipe)
        val start = CoroutineScope(Dispatchers.IO + Job())

        entry.reconcile(start)
        start.coroutineContext[Job]!!.children.forEach { it.join() }

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

    @Test
    fun `signing out clears the account after the device id is renewed and the profiles are gone`() = runBlocking {
        var wipedWhenAccountWent = false
        val watching = CoroutineScope(Dispatchers.Unconfined).launch {
            accounts.account.collect { if (it == null) wipedWhenAccountWent = deviceIds.current() != deviceId && profiles.load(ada) == null }
        }

        wipe.wipeDevice()
        watching.cancel()

        assertTrue(wipedWhenAccountWent)
    }

    @Test
    fun `signing out forgets the Google account once the device is wiped, and leaves nothing pending`() = runBlocking {
        entry(wipe).signOut()

        assertEquals(listOf<Account?>(null), forgotten)
        assertEquals(emptyMap<String, Any?>(), signOutPending)
    }

    @Test
    fun `a Google account a sign-out could not forget is forgotten at the next start`() = runBlocking {
        forgettingFails = true
        entry(wipe).signOut()
        assertEquals(emptyList<Account?>(), forgotten)

        forgettingFails = false
        val start = CoroutineScope(Dispatchers.IO + Job())
        entry(wipe).reconcile(start)
        start.coroutineContext[Job]!!.children.forEach { it.join() }

        assertEquals(listOf<Account?>(null), forgotten)
        assertEquals(emptyMap<String, Any?>(), signOutPending)
    }

    @Test
    fun `a sign-out that fails at start goes to the log, never ending the app`() = runBlocking {
        val killed = DeviceWipe(context, database, accounts, sessions, deviceIds, profiles) { error("The disk failed") }
        var escaped: Throwable? = null
        val start = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineExceptionHandler { _, error -> escaped = error })

        entry(killed).reconcile(start)
        start.coroutineContext[Job]!!.children.forEach { it.join() }

        assertNull(escaped)
    }

    @Test
    fun `a sign-in after a sign-out that could not forget the Google account forgets it first`() = runBlocking {
        forgettingFails = true
        entry(wipe).signOut()
        forgettingFails = false

        entry(wipe).signIn()

        assertEquals(listOf(false to 1), sheetAsked)
        assertEquals(emptyMap<String, Any?>(), signOutPending)
    }

    @Test
    fun `a sign-in that still cannot forget the last Google account asks which account`() = runBlocking {
        forgettingFails = true
        entry(wipe).signOut()

        entry(wipe).signIn()

        assertEquals(listOf(true to 0), sheetAsked)
        assertEquals(setOf("google_account"), signOutPending.keys)
    }

    @Test
    fun `a sign-in with nothing left to forget lets Google offer the last account`() = runBlocking {
        entry(wipe).signIn()

        assertEquals(listOf(false to 0), sheetAsked)
    }

    @Test
    fun `a sign-out marks the Google account to forget before it wipes, so one killed after the wipe still forgets it`() = runBlocking {
        entry(wipe).signOut()

        assertEquals(setOf("google_account"), pendingWhenWiped?.keys)
    }

    @Test
    fun `leaving for another account marks the Google account before the account goes`() = runBlocking {
        var pendingWhenAccountWent: Map<String, *>? = null
        val watching = CoroutineScope(Dispatchers.Unconfined).launch {
            accounts.account.collect { if (it == null) pendingWhenAccountWent = signOutPending }
        }

        entry(wipe).leaveForAnotherAccount()
        watching.cancel()

        assertEquals(setOf("google_account"), pendingWhenAccountWent?.keys)
    }

    @Test
    fun `a sign-in graspy does not take forgets the Google account it used`() = runBlocking {
        val signedIn = AccountEntry(context, { SignInOutcome.Succeeded(UID) }, firebase, accounts, sessions, unusedSessionApi, deviceIds, wipe)

        signedIn.signIn()

        assertEquals(1, forgotten.size)
        assertEquals(emptyMap<String, Any?>(), signOutPending)
    }

    @Test
    fun `leaving for another account marks a Google account it could not forget, for the next sign-in`() = runBlocking {
        forgettingFails = true

        entry(wipe).leaveForAnotherAccount()

        assertEquals(setOf("google_account"), signOutPending.keys)
    }

    private fun entry(wipe: DeviceWipe) =
        AccountEntry(context, sheet, firebase, accounts, sessions, unusedSessionApi, deviceIds, wipe)

    private suspend fun assertLearnerDataGone() {
        assertTrue(workCancelled)
        assertEquals(emptyList<String>(), database.submissionDao().observeLessonTurns(ada).first().map { it.localId })
        assertEquals(emptyList<String>(), database.lessonCacheDao().observeCatalogue(ada, "primary_3").first().map { it.planId })
        assertNull(database.lessonCacheDao().observeLessonMove(ada, "primary_3").first())
        assertEquals(emptyList<CopiedTopic>(), database.lessonCopyDao().copied(ada))
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
