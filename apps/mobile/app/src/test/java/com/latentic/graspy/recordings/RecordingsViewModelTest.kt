package com.latentic.graspy.recordings

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.google.firebase.auth.FirebaseAuthException
import com.latentic.graspy.account.hostActivity
import com.latentic.graspy.account.httpError
import com.latentic.graspy.auth.Confirmation
import com.latentic.graspy.auth.FakeConfirmation
import com.latentic.graspy.settleMain
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** A parent's screen for a learner's voice recordings: whether they are kept, the list, and the switch. */
@RunWith(RobolectricTestRunner::class)
class RecordingsViewModelTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val application: Application = RuntimeEnvironment.getApplication()
    private val activity = hostActivity()
    private val parent = FakeConfirmation()
    private val playback = FakePlayback()
    private val api = FakeRecordingsApi()
    private val cache get() = File(folder.root, "kept")

    /** Held as a screen's would be, so that leaving the screen clears it. */
    private val store = ViewModelStore()

    private fun viewModel(): RecordingsViewModel {
        val made = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                RecordingsViewModel(application, VoiceKeeping(api, cache), parent, playback) as T
        }
        val model = ViewModelProvider(store, made)[RecordingsViewModel::class.java]
        model.load(LEARNER)
        settleMain { model.state.value.loaded || model.state.value.loadFailed }
        return model
    }

    private fun RecordingsViewModel.settled() = settleMain { !state.value.busy && state.value.fetching == null }

    private val two = listOf(kept("r-old", 1_000L, lesson = "Two times table"), kept("r-new", 2_000L))
    private val kept90 = VoiceConsentDto(noticeVersion = 1, retentionDays = 90, grantedAt = 5L)

    @Test
    fun `recordings not kept - the screen says none is, and shows nothing to play`() {
        val model = viewModel()

        assertFalse(model.state.value.keeping)
        assertNull(model.state.value.consent)
        assertTrue(model.state.value.recordings.isEmpty())
        assertNull(model.state.value.step)
    }

    @Test
    fun `recordings kept - the days, and the list newest first`() {
        api.consent = kept90
        api.kept += two

        val model = viewModel()

        assertTrue(model.state.value.keeping)
        assertEquals(90, model.state.value.consent?.retentionDays)
        assertEquals(listOf("r-new", "r-old"), model.state.value.recordings.map { it.id })
    }

    @Test
    fun `recordings kept but none made yet - the list is empty`() {
        api.consent = kept90

        val model = viewModel()

        assertTrue(model.state.value.keeping)
        assertTrue(model.state.value.recordings.isEmpty())
    }

    @Test
    fun `graspy not reached to list them says so, and trying again lists them`() {
        api.refusedWith = IOException("graspy could not be reached")
        val model = viewModel()

        assertTrue(model.state.value.loadFailed)
        assertFalse(model.state.value.loaded)
        api.refusedWith = null
        model.load(LEARNER)
        settleMain { model.state.value.loaded }
        assertFalse(model.state.value.loadFailed)
    }

    @Test
    fun `further pages are listed from where the last ended`() {
        api.kept += (1L..5L).map { kept("r$it", it * 1_000) }
        api.pageSize = 2

        val model = viewModel()
        assertEquals(listOf("r5", "r4"), model.state.value.recordings.map { it.id })
        model.more()
        model.settled()
        model.more()
        model.settled()

        assertEquals(listOf("r5", "r4", "r3", "r2", "r1"), model.state.value.recordings.map { it.id })
        assertNull(model.state.value.nextBefore)
        assertEquals(listOf("overview:$LEARNER:null", "overview:$LEARNER:4000", "overview:$LEARNER:2000"), api.calls)
    }

    @Test
    fun `turning keeping on opens the notice with 30 days chosen, and nothing is kept until the parent agrees`() {
        val model = viewModel()

        model.switchTapped()

        assertEquals(RecordingsStep.KEEPING, model.state.value.step)
        assertEquals(30, model.state.value.days)
        assertNull(api.consent)
        assertTrue(parent.shownOver.isEmpty())
    }

    @Test
    fun `agreeing signs the parent in again, and the fresh token and the days chosen are what graspy is sent`() {
        val model = viewModel()
        model.switchTapped()
        model.chooseDays(365)

        model.keep(activity)
        model.settled()

        assertEquals(listOf(activity), parent.shownOver)
        assertTrue(api.calls.contains("keep:$LEARNER:1:365:${FakeConfirmation.TOKEN}"))
        assertEquals(365, model.state.value.consent?.retentionDays)
        assertNull(model.state.value.step)
        assertTrue(model.state.value.keeping)
    }

    @Test
    fun `a parent who closes Google's sheet keeps nothing, and is left at the notice`() {
        parent.next = Confirmation.Cancelled
        val model = viewModel()
        model.switchTapped()

        model.keep(activity)
        model.settled()

        assertNull(api.consent)
        assertFalse(model.state.value.keeping)
        assertEquals(RecordingsStep.KEEPING, model.state.value.step)
        assertNull(model.state.value.problem)
    }

    @Test
    fun `leaving the notice with Cancel keeps nothing`() {
        val model = viewModel()
        model.switchTapped()

        model.dismiss()

        assertNull(model.state.value.step)
        assertFalse(model.state.value.keeping)
    }

    @Test
    fun `a stale sign-in, or a notice graspy does not know, is a retry that signs in again`() {
        val model = viewModel()
        model.switchTapped()
        val refusals = listOf(
            Triple(401, "sign_in_stale", RecordingsProblem.SIGN_IN),
            Triple(400, "notice_unknown", RecordingsProblem.SIGN_IN),
            Triple(422, "invalid", RecordingsProblem.FAILED),
            Triple(503, "consent_not_kept", RecordingsProblem.NOT_KEPT),
        )
        for ((status, code, told) in refusals) {
            api.refusedWith = httpError(status, """{"detail":{"error":"refused","code":"$code"}}""")

            model.keep(activity)
            model.settled()

            assertEquals(code, told, model.state.value.problem)
            assertEquals(code, RecordingsStep.KEEPING, model.state.value.step)
            assertFalse(code, model.state.value.keeping)
        }
        api.refusedWith = null

        model.keep(activity)
        model.settled()

        assertTrue(model.state.value.keeping)
        assertNull(model.state.value.problem)
        assertEquals(5, parent.shownOver.size)
    }

    @Test
    fun `a Google account that is not the account's is told as such, on the phone's check or graspy's`() {
        parent.next = Confirmation.OtherAccount
        val model = viewModel()
        model.switchTapped()
        model.keep(activity)
        model.settled()
        assertEquals(RecordingsProblem.OTHER_ACCOUNT, model.state.value.problem)

        parent.next = FakeConfirmation.confirmed()
        api.refusedWith = httpError(403, """{"detail":{"error":"not this account's","code":"sign_in_other_account"}}""")
        model.keep(activity)
        model.settled()
        assertEquals(RecordingsProblem.OTHER_ACCOUNT, model.state.value.problem)
        assertFalse(model.state.value.keeping)
    }

    @Test
    fun `turning keeping off with nothing kept stops at once`() {
        api.consent = kept90
        val model = viewModel()

        model.switchTapped()
        model.settled()

        assertNull(model.state.value.step)
        assertFalse(model.state.value.keeping)
        assertTrue(api.calls.contains("stop:$LEARNER:false"))
    }

    @Test
    fun `turning keeping off with recordings kept asks whether to delete them too`() {
        api.consent = kept90
        api.kept += two
        val model = viewModel()

        model.switchTapped()

        assertEquals(RecordingsStep.STOPPING, model.state.value.step)
        assertTrue(model.state.value.keeping)
        assertTrue(api.calls.none { it.startsWith("stop") })
    }

    @Test
    fun `stopping and deleting asks again while graspy says more is kept, until none is`() {
        api.consent = kept90
        api.kept += (1L..5L).map { kept("r$it", it * 1_000) }
        api.deletesPerCall = 2
        val model = viewModel()
        model.switchTapped()

        model.stop(deleteRecordings = true)
        model.settled()

        assertEquals(3, api.calls.count { it == "stop:$LEARNER:true" })
        assertTrue(api.kept.isEmpty())
        assertFalse(model.state.value.keeping)
        assertTrue(model.state.value.recordings.isEmpty())
        assertNull(model.state.value.step)
    }

    @Test
    fun `stopping and leaving what was kept keeps the list, to expire by itself`() {
        api.consent = kept90
        api.kept += two
        val model = viewModel()
        model.switchTapped()

        model.stop(deleteRecordings = false)
        model.settled()

        assertFalse(model.state.value.keeping)
        assertEquals(2, model.state.value.recordings.size)
        assertEquals(2, api.kept.size)
        assertTrue(api.calls.contains("stop:$LEARNER:false"))
    }

    @Test
    fun `one recording is deleted, and only that one`() {
        api.consent = kept90
        api.kept += two
        val model = viewModel()

        model.delete("r-old")
        model.settled()

        assertEquals(listOf("r-new"), model.state.value.recordings.map { it.id })
        assertEquals(listOf("r-new"), api.kept.map { it.id })
    }

    @Test
    fun `delete all asks first, then asks again while graspy says more is kept, until none is`() {
        api.consent = kept90
        api.kept += (1L..7L).map { kept("r$it", it * 1_000) }
        api.deletesPerCall = 3
        val model = viewModel()

        model.askDeleteAll()
        assertEquals(RecordingsStep.DELETING_ALL, model.state.value.step)
        assertTrue(api.calls.none { it.startsWith("deleteAll") })
        model.deleteAll()
        model.settled()

        assertEquals(3, api.calls.count { it == "deleteAll:$LEARNER" })
        assertTrue(api.kept.isEmpty())
        assertTrue(model.state.value.recordings.isEmpty())
        assertNull(model.state.value.step)
        assertTrue(model.state.value.keeping)
    }

    @Test
    fun `a delete-all that deletes nothing yet says more is kept says so, asks once, and lists what is left`() {
        api.consent = kept90
        api.kept += (1L..4L).map { kept("r$it", it * 1_000) }
        api.deletesNothing = true
        val model = viewModel()

        model.deleteAll()
        model.settled()

        assertEquals(RecordingsProblem.FAILED, model.state.value.problem)
        assertEquals(1, api.calls.count { it == "deleteAll:$LEARNER" })
        assertEquals(4, model.state.value.recordings.size)
    }

    @Test
    fun `a failed delete says so and can be tried again`() {
        api.consent = kept90
        api.kept += two
        val model = viewModel()
        api.refusedWith = IOException("graspy could not be reached")

        model.delete("r-old")
        model.settled()

        assertEquals(RecordingsProblem.FAILED, model.state.value.problem)
        assertEquals(2, model.state.value.recordings.size)
        api.refusedWith = null
        model.delete("r-old")
        model.settled()
        assertEquals(listOf("r-new"), model.state.value.recordings.map { it.id })
    }

    @Test
    fun `a recording is fetched to a file in the cache, played from it, and the file is deleted once it ends`() {
        api.consent = kept90
        api.kept += two
        api.audio = "the child's voice".toByteArray()
        val model = viewModel()

        model.play("r-new")
        model.settled()

        assertEquals("r-new", model.state.value.playing)
        assertEquals("the child's voice", String(playback.heard.single()))
        val file = playback.played.single()
        assertEquals(cache, file.parentFile)
        assertTrue(file.exists())
        playback.finish()
        assertFalse(file.exists())
        assertNull(model.state.value.playing)
    }

    @Test
    fun `tapping the recording playing stops it and deletes its file`() {
        api.kept += two
        val model = viewModel()
        model.play("r-new")
        model.settled()
        val file = cache.listFiles().orEmpty().single()

        model.play("r-new")

        assertNull(model.state.value.playing)
        assertFalse(file.exists())
        assertTrue(playback.stops > 0)
    }

    @Test
    fun `playing another recording ends the first and deletes its file`() {
        api.kept += two
        val model = viewModel()
        model.play("r-new")
        model.settled()
        val first = cache.listFiles().orEmpty().single()

        model.play("r-old")
        model.settled()

        assertFalse(first.exists())
        assertEquals("r-old", model.state.value.playing)
        assertEquals(1, cache.listFiles().orEmpty().size)
    }

    @Test
    fun `a recording that is gone is dropped from the list, and the parent is told it is gone`() {
        api.kept += two
        val model = viewModel()
        api.kept.removeAll { it.id == "r-old" }

        model.play("r-old")
        model.settled()

        assertEquals(listOf("r-new"), model.state.value.recordings.map { it.id })
        assertEquals(RecordingsProblem.GONE, model.state.value.problem)
        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `a recording that could not be fetched says so and leaves no file behind`() {
        api.kept += two
        val model = viewModel()
        api.refusedWith = IOException("graspy could not be reached")

        model.play("r-new")
        model.settled()

        assertEquals(RecordingsProblem.PLAY_FAILED, model.state.value.problem)
        assertTrue(cache.listFiles().orEmpty().isEmpty())
        assertTrue(playback.played.isEmpty())
    }

    @Test
    fun `deleting the recording that plays stops it and deletes its file`() {
        api.kept += two
        val model = viewModel()
        model.play("r-new")
        model.settled()
        val file = cache.listFiles().orEmpty().single()

        model.delete("r-new")
        model.settled()

        assertFalse(file.exists())
        assertNull(model.state.value.playing)
    }

    @Test
    fun `a recording left in the cache by a screen that was killed is removed when the screen opens`() {
        cache.mkdirs()
        val left = File(cache, "left.wav").apply { writeText("a child's voice") }

        viewModel()

        assertFalse(left.exists())
    }

    @Test
    fun `leaving the screen while a recording plays stops it and deletes its file`() {
        api.kept += two
        val model = viewModel()
        model.play("r-new")
        model.settled()
        val file = cache.listFiles().orEmpty().single()

        store.clear()

        assertFalse(file.exists())
        assertTrue(playback.stops > 0)
    }

    @Test
    fun `Firebase failing inside the sign-in is a retry, and nothing is left busy`() {
        parent.throwing = FirebaseAuthException("ERROR_INTERNAL_ERROR", "An internal error has occurred")
        val model = viewModel()
        model.switchTapped()

        model.keep(activity)
        model.settled()

        assertEquals(RecordingsProblem.SIGN_IN, model.state.value.problem)
        assertFalse(model.state.value.busy)
        assertEquals(RecordingsStep.KEEPING, model.state.value.step)
        parent.throwing = null
        model.keep(activity)
        model.settled()
        assertTrue(model.state.value.keeping)
    }

    @Test
    fun `deleting a recording while it is still being fetched stops the fetch, and it is never played`() {
        api.kept += two
        val gate = CompletableDeferred<Unit>().also { api.audioGate = it }
        val model = viewModel()
        model.play("r-new")
        settleMain { api.calls.any { it.startsWith("audio") } }

        model.delete("r-new")
        gate.complete(Unit)
        model.settled()

        assertTrue(playback.played.isEmpty())
        assertNull(model.state.value.playing)
        assertNull(model.state.value.fetching)
        assertEquals(listOf("r-old"), model.state.value.recordings.map { it.id })
        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `deleting all while a recording is still being fetched stops the fetch, and nothing is played`() {
        api.kept += two
        val gate = CompletableDeferred<Unit>().also { api.audioGate = it }
        val model = viewModel()
        model.play("r-old")
        settleMain { api.calls.any { it.startsWith("audio") } }

        model.deleteAll()
        gate.complete(Unit)
        model.settled()

        assertTrue(playback.played.isEmpty())
        assertNull(model.state.value.fetching)
        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `stopping and deleting while a recording is still being fetched stops the fetch too`() {
        api.consent = kept90
        api.kept += two
        val gate = CompletableDeferred<Unit>().also { api.audioGate = it }
        val model = viewModel()
        model.play("r-old")
        settleMain { api.calls.any { it.startsWith("audio") } }

        model.stop(deleteRecordings = true)
        gate.complete(Unit)
        model.settled()

        assertTrue(playback.played.isEmpty())
        assertTrue(cache.listFiles().orEmpty().isEmpty())
    }

    @Test
    fun `deleting a recording that plays stops it at once, before graspy has answered`() {
        api.kept += two
        val model = viewModel()
        model.play("r-new")
        model.settled()
        val file = cache.listFiles().orEmpty().single()

        model.delete("r-new")

        assertNull(model.state.value.playing)
        assertFalse(file.exists())
    }

    @Test
    fun `a recording the player cannot play says so, and leaves no file and no Stop on its row`() {
        api.kept += two
        playback.playFails = IllegalStateException("the player could not open the file")
        val model = viewModel()

        model.play("r-new")
        model.settled()

        assertEquals(RecordingsProblem.PLAY_FAILED, model.state.value.problem)
        assertNull(model.state.value.playing)
        assertTrue(cache.listFiles().orEmpty().isEmpty())
        playback.playFails = null
        model.play("r-new")
        model.settled()
        assertEquals("r-new", model.state.value.playing)
    }

    @Test
    fun `leaving the screen for the background stops what plays and deletes its file`() {
        api.kept += two
        val model = viewModel()
        model.play("r-new")
        model.settled()
        val file = cache.listFiles().orEmpty().single()

        model.stopPlaying()

        assertNull(model.state.value.playing)
        assertFalse(file.exists())
        assertTrue(playback.stops > 0)
    }

    @Test
    fun `a recording is not played while a delete is in flight, and is not heard once it is deleted`() {
        api.kept += two
        val gate = CompletableDeferred<Unit>().also { api.deleteGate = it }
        val model = viewModel()
        model.delete("r-old")
        settleMain { api.calls.any { it.startsWith("delete") } }

        model.play("r-old")
        model.play("r-new")
        gate.complete(Unit)
        model.settled()

        assertTrue(api.calls.none { it.startsWith("audio") })
        assertTrue(playback.played.isEmpty())
        assertNull(model.state.value.playing)
        assertEquals(listOf("r-new"), model.state.value.recordings.map { it.id })
    }

    @Test
    fun `a recording is not played while delete-all is in flight`() {
        api.consent = kept90
        api.kept += two
        val gate = CompletableDeferred<Unit>().also { api.deleteGate = it }
        val model = viewModel()
        model.deleteAll()
        settleMain { api.calls.any { it.startsWith("deleteAll") } }

        model.play("r-new")
        gate.complete(Unit)
        model.settled()

        assertTrue(api.calls.none { it.startsWith("audio") })
        assertTrue(playback.played.isEmpty())
    }
}
