package com.latentic.graspy.account

import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import com.latentic.graspy.lesson.CopiedLesson
import com.latentic.graspy.lesson.LessonCopyEntity
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.practice.TEACHER_AUDIO_DIRECTORY
import java.io.File
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CoroutineDispatcher
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
        pendingWhenWiped = signOutPending()
    }
    private val google = GoogleAccountForgets(accounts)
    private val firebase = FakeFirebase(google)
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
    fun `signing out forgets the Google account once the device is wiped, and leaves only its note`() = runBlocking {
        entry(wipe).signOut()

        assertEquals(listOf<Account?>(null), google.forgotten)
        assertEquals(setOf("signing_out"), signOutPending().keys)
    }

    @Test
    fun `a Google account a sign-out could not forget is forgotten at the next start`() = runBlocking {
        google.failing = true
        entry(wipe).signOut()
        assertEquals(emptyList<Account?>(), google.forgotten)

        google.failing = false
        val start = CoroutineScope(Dispatchers.IO + Job())
        entry(wipe).reconcile(start)
        start.coroutineContext[Job]!!.children.forEach { it.join() }

        assertEquals(listOf<Account?>(null), google.forgotten)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
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
    fun `a sign-out marks the Google account to forget before it wipes, so one killed after the wipe still forgets it`() = runBlocking {
        entry(wipe).signOut()

        assertEquals(setOf("google_account", "signing_out"), pendingWhenWiped?.keys)
    }

    @Test
    fun `leaving for another account marks the Google account before the account goes`() = runBlocking {
        var pendingWhenAccountWent: Map<String, *>? = null
        val watching = CoroutineScope(Dispatchers.Unconfined).launch {
            accounts.account.collect { if (it == null) pendingWhenAccountWent = signOutPending() }
        }

        entry(wipe).leaveForAnotherAccount()
        watching.cancel()

        assertEquals(setOf("google_account", "signing_in"), pendingWhenAccountWent?.keys)
    }

    @Test
    fun `leaving for another account marks a Google account it could not forget, for the next sign-in`() = runBlocking {
        google.failing = true

        entry(wipe).leaveForAnotherAccount()

        assertEquals(setOf("google_account", "signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-out whose Firebase sign-out never reached the disk is not adopted, and keeps its note until Firebase is empty`() = runBlocking {
        firebase.uid = UID
        entry(wipe).signOut()

        firebase.uid = UID
        start()
        assertNull("the signed-out account was adopted", accounts.account.value)
        assertNull(firebase.uid)

        firebase.uid = UID
        start()
        assertNull("the signed-out account was adopted", accounts.account.value)

        start()
        assertNull(accounts.account.value)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
    }

    @Test
    fun `a sign-out cut short mid-wipe, its Firebase sign-out never on disk, is finished at the next start`() = runBlocking {
        firebase.uid = UID
        val killed = DeviceWipe(context, database, accounts, sessions, deviceIds, profiles) { error("The app was killed") }
        runCatching { entry(killed).signOut() }

        firebase.uid = UID
        start()

        assertLearnerDataGone()
        assertNull(profiles.load(ada))
        assertNull(accounts.account.value)
        assertNull(firebase.uid)
    }

    @Test
    fun `leaving for another account, its Firebase sign-out never on disk, is not adopted and keeps the learning`() = runBlocking {
        accounts.set(signedIn(learner = null, deviceJoins = true))
        firebase.uid = UID
        entry(wipe).leaveForAnotherAccount()

        firebase.uid = UID
        start()

        assertNull("the account left was adopted", accounts.account.value)
        assertNull(firebase.uid)
        assertEquals(0, wipes)
        assertEquals(adaProfile, profiles.load(ada))
    }

    @Test
    fun `leaving for another account after a sign-out whose wipe failed part-way finishes that wipe`() = runBlocking {
        val failsOnce = failingOnce()
        runCatching { entry(failsOnce).signOut() }
        assertEquals("the picker is shown", signedIn(learner = null, deviceJoins = false), accounts.account.value)

        entry(failsOnce).leaveForAnotherAccount()

        assertLearnerDataGone()
        assertFalse(teacherAudio.exists())
        assertNull(profiles.load(ada))
        assertNull(profiles.load(bayo))
        assertNull(accounts.account.value)
        assertNotEquals(deviceId, deviceIds.current())
        assertEquals(setOf("signing_out"), signOutPending().keys)
    }

    @Test
    fun `a sign-out whose wipe fails again as the account leaves keeps the account and its note for the next start`() = runBlocking {
        val failing = DeviceWipe(context, database, accounts, sessions, deviceIds, profiles) { error("The disk failed") }
        runCatching { entry(failing).signOut() }

        runCatching { entry(failing).leaveForAnotherAccount() }

        assertEquals(signedIn(learner = null, deviceJoins = false), accounts.account.value)
        assertTrue("signing_out" in signOutPending())
        start()
        assertNull(accounts.account.value)
        assertNull(profiles.load(ada))
        assertNotEquals(deviceId, deviceIds.current())
    }

    @Test
    fun `an account deleted after a refusal signed it out leaves the account signed in since alone`() = runBlocking {
        val entry = entry(wipe)
        val api = FakeAccountApi()
        api.whileDeleting = {
            entry.signOut(of = UID)
            accounts.set(Account("uid-2", "other@example.com", learner = null, deviceJoins = true))
            firebase.uid = "uid-2"
        }
        val directory = accountDirectory(api, accounts, profiles, { wipe }, { entry })

        directory.deleteAccount()

        assertEquals(listOf("delete"), api.calls)
        assertEquals("uid-2", accounts.account.value?.uid)
        assertEquals("uid-2", firebase.uid)
        assertEquals("only the refusal wiped the device", 1, wipes)
    }

    @Test
    fun `a sign-out the start finishes leaves an account signed in before it runs alone`() = runBlocking {
        context.getSharedPreferences(PreferenceFiles.SIGN_OUT, 0).edit().putBoolean("signing_out", true).commit()
        val held = mutableListOf<Runnable>()
        var holding = true
        val start = CoroutineScope(Job() + object : CoroutineDispatcher() {
            override fun dispatch(context: CoroutineContext, block: Runnable) {
                if (holding) held += block else block.run()
            }
        })

        entry(wipe).reconcile(start)
        accounts.set(Account("uid-2", "other@example.com", learner = null, deviceJoins = true))
        firebase.uid = "uid-2"
        holding = false
        held.forEach { it.run() }
        start.coroutineContext[Job]!!.children.forEach { it.join() }

        assertEquals("uid-2", accounts.account.value?.uid)
        assertEquals(0, wipes)
    }

    /** A wipe that fails once, after the learner has gone, as a full disk would. */
    private fun failingOnce(): DeviceWipe {
        var failed = false
        return DeviceWipe(context, database, accounts, sessions, deviceIds, profiles) {
            if (!failed) {
                failed = true
                error("The disk failed")
            }
            workCancelled = true
            wipes += 1
        }
    }

    private fun entry(wipe: DeviceWipe) =
        AccountEntry(context, { _, _ -> error("No sign-in is asked for") }, firebase, accounts, sessions, noSessionApi, deviceIds, wipe)

    /** The app's start, its work waited for. */
    private suspend fun start() {
        val scope = CoroutineScope(Dispatchers.IO + Job())
        entry(wipe).reconcile(scope)
        scope.coroutineContext[Job]!!.children.forEach { it.join() }
    }

    private suspend fun assertLearnerDataGone() {
        assertTrue(workCancelled)
        assertEquals(emptyList<String>(), database.submissionDao().observeLessonTurns(ada).first().map { it.localId })
        assertEquals(emptyList<String>(), database.lessonCacheDao().observeCatalogue(ada, "primary_3").first().map { it.planId })
        assertNull(database.lessonCacheDao().observeLessonMove(ada, "primary_3").first())
        assertEquals(emptyList<CopiedLesson>(), database.lessonCopyDao().copied(ada))
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
