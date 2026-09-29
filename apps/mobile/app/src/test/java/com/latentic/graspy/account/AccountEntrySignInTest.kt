package com.latentic.graspy.account

import com.latentic.graspy.auth.SignInOutcome
import com.latentic.graspy.localization.LearnerProfileStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AccountEntrySignInTest {
    private val context = context()
    private val activity = hostActivity()
    private val database = inMemoryDatabase()
    private val accounts = accountStore(null)
    private val sessions = heldSessions(accounts)
    private val deviceIds = DeviceIdStore(context.getSharedPreferences(PreferenceFiles.DEVICE, 0))
    private var wipes = 0
    private val wipe = DeviceWipe(context, database, accounts, sessions, deviceIds, LearnerProfileStore(context)) { wipes += 1 }
    private val google = GoogleAccountForgets(accounts)
    private val firebase = FakeFirebase(google)

    /** For each sign-in, whether the sheet was told to ask which account, and how many forgets came before it. */
    private val sheetAsked = mutableListOf<Pair<Boolean, Int>>()
    private val sheet: suspend (Boolean) -> SignInOutcome = { askWhichAccount ->
        sheetAsked += askWhichAccount to google.forgotten.size
        SignInOutcome.Cancelled
    }

    @After
    fun close() = database.close()

    @Test
    fun `a sign-in after a sign-out that could not forget the Google account forgets it first`() = runBlocking {
        accounts.set(signedIn(learner = null))
        google.failing = true
        entry().signOut()
        google.failing = false

        entry().signIn(activity)

        assertEquals(listOf(false to 1), sheetAsked)
        assertEquals(setOf("signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in that still cannot forget the last Google account asks which account`() = runBlocking {
        accounts.set(signedIn(learner = null))
        google.failing = true
        entry().signOut()

        entry().signIn(activity)

        assertEquals(listOf(true to 0), sheetAsked)
        assertEquals(setOf("google_account", "signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in with nothing left to forget lets Google offer the last account`() = runBlocking {
        entry().signIn(activity)

        assertEquals(listOf(false to 0), sheetAsked)
    }

    @Test
    fun `a sign-in graspy does not take forgets the Google account it used`() = runBlocking {
        entry { SignInOutcome.Succeeded(UID) }.signIn(activity)

        assertEquals(1, google.forgotten.size)
        assertEquals(setOf("signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in graspy does not take marks a Google account it could not forget, for the next sign-in`() = runBlocking {
        google.failing = true

        entry { SignInOutcome.Succeeded(UID) }.signIn(activity)

        assertEquals(setOf("google_account", "signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in graspy does not take is undone at the next start, though Firebase's sign-out never reached the disk`() = runBlocking {
        entry { firebase.uid = UID; SignInOutcome.Succeeded(UID) }.signIn(activity)
        firebase.uid = UID

        start()

        assertNull(accounts.account.value)
        assertNull(firebase.uid)
    }

    @Test
    fun `a sign-in that fails after a Google account was chosen forgets it`() = runBlocking {
        entry { SignInOutcome.Failed("Firebase refused the credential") }.signIn(activity)

        assertEquals(1, google.forgotten.size)
        assertEquals(setOf("signing_in"), signOutPending().keys)
    }

    @Test
    fun `a failed sign-in marks a Google account it could not forget, for the next sign-in`() = runBlocking {
        google.failing = true

        entry { SignInOutcome.Failed("Firebase refused the credential") }.signIn(activity)

        assertEquals(setOf("google_account", "signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in left part-way signs Firebase out, marks the Google account and leaves itself for the next start to undo`() = runBlocking {
        firebase.uid = UID
        val atSheet = CompletableDeferred<Unit>()
        val left = entry { atSheet.complete(Unit); awaitCancellation() }

        val signingIn = launch { left.signIn(activity) }
        atSheet.await()
        signingIn.cancelAndJoin()

        assertNull(firebase.uid)
        assertEquals(setOf("google_account", "signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in waits for one left while Firebase finishes, which then cannot sign it out`() = runBlocking {
        val atFirstSheet = CompletableDeferred<Unit>()
        val firebaseFinishes = CompletableDeferred<Unit>()
        val secondAsked = CompletableDeferred<Pair<Boolean, Int>>()
        var sheets = 0
        val entry = entry { askWhichAccount ->
            sheets += 1
            if (sheets == 1) {
                atFirstSheet.complete(Unit)
                // As FirebaseSession waits out Firebase's sign-in.
                withContext(NonCancellable) {
                    firebaseFinishes.await()
                    firebase.uid = "uid-first"
                }
                // The sheet's next suspension, its caller gone.
                yield()
                SignInOutcome.Succeeded("uid-first")
            } else {
                // Signed in before the test is told, which then reads Firebase from another thread.
                firebase.uid = "uid-second"
                secondAsked.complete(askWhichAccount to google.forgotten.size)
                awaitCancellation()
            }
        }
        val first = launch(Dispatchers.Default) { entry.signIn(activity) }
        atFirstSheet.await()
        first.cancel()
        val second = launch(Dispatchers.Default) { entry.signIn(activity) }

        firebaseFinishes.complete(Unit)
        val (_, forgetsBefore) = secondAsked.await()
        first.join()

        assertEquals("the second sign-in forgot the Google account the first left marked", 1, forgetsBefore)
        assertEquals("uid-second", firebase.uid)
        second.cancelAndJoin()
    }

    @Test
    fun `a Google task cancelled while the sign-in runs fails it, and the Google account is forgotten`() = runBlocking {
        val outcome = entry { throw CancellationException("A Play services task was cancelled") }.signIn(activity)

        assertTrue(outcome.toString(), outcome is SignInOutcome.Failed)
        assertEquals(listOf<Account?>(null), google.forgotten)
        assertEquals(setOf("signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in that ends without an account leaves Firebase signed out, even one Firebase finished late`() = runBlocking {
        for (outcome in listOf(SignInOutcome.Cancelled, SignInOutcome.Failed("refused"))) {
            firebase.uid = UID
            entry { outcome }.signIn(activity)
            assertNull(outcome.toString(), firebase.uid)
        }
    }

    @Test
    fun `a sign-in that ends without an account leaves its note, for a start that finds Firebase empty to drop`() = runBlocking {
        for (outcome in listOf(SignInOutcome.Cancelled, SignInOutcome.Failed("refused"))) {
            entry { outcome }.signIn(activity)
            assertTrue(outcome.toString(), "signing_in" in signOutPending())
        }

        start()

        assertNull(accounts.account.value)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
    }

    @Test
    fun `a sign-in begun before the start's work runs is left alone by the undoing of one cut short`() = runBlocking {
        firebase.uid = UID
        val prefs = context.getSharedPreferences(PreferenceFiles.SIGN_OUT, 0)
        prefs.edit().putBoolean("signing_in", true).commit()
        val held = mutableListOf<Runnable>()
        val start = CoroutineScope(Job() + object : CoroutineDispatcher() {
            override fun dispatch(context: CoroutineContext, block: Runnable) {
                held += block
            }
        })

        entry().reconcile(start)
        prefs.edit().putBoolean("signing_in", true).commit()
        firebase.uid = "uid-2"
        held.forEach { it.run() }

        assertEquals("uid-2", firebase.uid)
        assertTrue("signing_in" in signOutPending())
    }

    @Test
    fun `a sign-in that stored its account before it was cut short is kept, its note gone`() = runBlocking {
        accounts.set(signedIn(learner = null))
        firebase.uid = UID
        leftSigningIn()

        start()

        assertEquals(UID, accounts.account.value?.uid)
        assertEquals(UID, firebase.uid)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
    }

    @Test
    fun `a sign-in cut short is undone at the next start, its Google account forgotten, never adopted`() = runBlocking {
        firebase.uid = UID
        leftSigningIn()

        start()

        assertNull(accounts.account.value)
        assertNull(firebase.uid)
        assertEquals(listOf<Account?>(null), google.forgotten)
        assertEquals(setOf("signing_in"), signOutPending().keys)
    }

    @Test
    fun `a sign-in undone keeps its note until a start finds Firebase holding no one`() = runBlocking {
        firebase.uid = UID
        leftSigningIn()
        start()

        firebase.uid = UID
        start()
        assertNull("Firebase's sign-out never reached the disk, and the account was adopted", accounts.account.value)

        start()
        assertNull(accounts.account.value)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
    }

    @Test
    fun `a sign-in from before accounts, Firebase holding it with no note, is kept and its learning joins the first learner`() = runBlocking {
        firebase.uid = UID

        start()

        assertEquals(Account(UID, email = null, learner = null, deviceJoins = true), accounts.account.value)
        assertEquals(UID, firebase.uid)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
    }

    @Test
    fun `an account signed into after a sign-out is kept at the next start`() = runBlocking {
        accounts.set(signedIn(learner = null))
        firebase.uid = UID
        entry().signOut()

        signsInAnother().signIn(activity)
        start()

        assertEquals("uid-2", accounts.account.value?.uid)
        assertEquals("uid-2", firebase.uid)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
    }

    @Test
    fun `an account signed into after leaving for another is kept at the next start`() = runBlocking {
        accounts.set(signedIn(learner = null))
        firebase.uid = UID
        entry().leaveForAnotherAccount()

        signsInAnother().signIn(activity)
        start()

        assertEquals("uid-2", accounts.account.value?.uid)
        assertEquals("uid-2", firebase.uid)
        assertEquals(emptyMap<String, Any?>(), signOutPending())
    }

    @Test
    fun `an account a sign-in stores is kept at the next start, though a sign-out ran while it signed in`() = runBlocking {
        lateinit var signingIn: AccountEntry
        signingIn = entry(
            sessionApi = object : SessionApi {
                override suspend fun session(request: SessionRequestDto) = issued("session-2", learner = null)
            },
            sheet = {
                firebase.uid = "uid-2"
                signingIn.signOut()
                firebase.uid = "uid-2"
                SignInOutcome.Succeeded("uid-2")
            },
        )

        signingIn.signIn(activity)
        start()

        assertEquals("uid-2", accounts.account.value?.uid)
    }

    @Test
    fun `a sign-in a sign-out overtook stores nothing, and the next start undoes it though Firebase's sign-out was lost`() = runBlocking {
        lateinit var signingIn: AccountEntry
        signingIn = entry(
            sessionApi = object : SessionApi {
                override suspend fun session(request: SessionRequestDto): IssuedSessionDto {
                    signingIn.signOut()
                    return issued("session-2", learner = null)
                }
            },
            sheet = { firebase.uid = "uid-2"; SignInOutcome.Succeeded("uid-2") },
        )

        assertTrue(signingIn.signIn(activity) is SignInOutcome.Failed)
        assertNull(accounts.account.value)
        // Firebase's sign-out never reached the disk.
        firebase.uid = "uid-2"
        start()

        assertNull(accounts.account.value)
        assertNull(firebase.uid)
    }

    @Test
    fun `a refusal of the account left behind leaves the next sign-in, and the device's learning, alone`() = runBlocking {
        lateinit var signingIn: AccountEntry
        signingIn = entry(
            sessionApi = object : SessionApi {
                override suspend fun session(request: SessionRequestDto): IssuedSessionDto {
                    signingIn.signOut(of = UID)
                    return issued("session-2", learner = null)
                }
            },
            sheet = { firebase.uid = "uid-2"; SignInOutcome.Succeeded("uid-2") },
        )

        assertTrue(signingIn.signIn(activity) is SignInOutcome.Succeeded)
        signingIn.signOut(of = UID)
        start()

        assertEquals("uid-2", accounts.account.value?.uid)
        assertEquals("uid-2", firebase.uid)
        assertEquals(0, wipes)
    }

    @Test
    fun `a sign-out asked for while a sign-in stores its account waits, then signs that account out and keeps its note`() = runBlocking {
        val signingIn = signsInAnother()
        val signOutDone = CountDownLatch(1)
        var signingOut: Job? = null
        val watching = launch(Dispatchers.Unconfined) {
            accounts.account.collect { stored ->
                if (stored?.uid != "uid-2" || signingOut != null) return@collect
                signingOut = CoroutineScope(Dispatchers.IO).launch {
                    signingIn.signOut()
                    signOutDone.countDown()
                }
                // The sign-in is held here, as it stores the account: a sign-out that could run now would finish first.
                assertFalse("the sign-out ran while the account was stored", signOutDone.await(1, TimeUnit.SECONDS))
            }
        }

        assertTrue(signingIn.signIn(activity) is SignInOutcome.Succeeded)
        signingOut!!.join()
        watching.cancel()

        assertNull(accounts.account.value)
        assertEquals(1, wipes)
        assertEquals(setOf("signing_out"), signOutPending().keys)
    }

    /** [sheet] is told whether to ask which account. */
    private fun entry(sessionApi: SessionApi = noSessionApi, sheet: suspend (Boolean) -> SignInOutcome = this.sheet) =
        AccountEntry(context, { _, ask -> sheet(ask) }, firebase, accounts, sessions, sessionApi, deviceIds, wipe)

    /** A sign-in Google, Firebase and graspy all take, of an account other than the one that left. */
    private fun signsInAnother() = entry(
        sessionApi = object : SessionApi {
            override suspend fun session(request: SessionRequestDto) = issued("session-2", learner = null)
        },
        sheet = { firebase.uid = "uid-2"; SignInOutcome.Succeeded("uid-2") },
    )

    private fun leftSigningIn() =
        context.getSharedPreferences(PreferenceFiles.SIGN_OUT, 0).edit().putBoolean("signing_in", true).commit()

    /** The app's start, its work waited for. */
    private suspend fun start() {
        val scope = CoroutineScope(Dispatchers.IO + Job())
        entry().reconcile(scope)
        scope.coroutineContext[Job]!!.children.forEach { it.join() }
    }
}
