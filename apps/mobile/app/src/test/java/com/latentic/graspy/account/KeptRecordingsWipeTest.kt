package com.latentic.graspy.account

import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.recordings.KEPT_RECORDINGS_DIRECTORY
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A recording fetched for a parent to hear is a child's voice: leaving the learner or signing out leaves none on the phone. */
@RunWith(RobolectricTestRunner::class)
class KeptRecordingsWipeTest {
    private val context = context()
    private val accounts = accountStore(signedIn(ADA, deviceJoins = false))
    private val deviceIds = DeviceIdStore(context.getSharedPreferences(PreferenceFiles.DEVICE, 0))
    private val sessions = SessionTokens(
        accounts = accounts,
        deviceId = deviceIds::current,
        idToken = { _, _ -> "google-id-token" },
        exchange = { issued("session", it.learnerId?.let { ADA }) },
        learnerGone = {},
        signedOutElsewhere = {},
    )
    private val wipe = DeviceWipe(context, inMemoryDatabase(), accounts, sessions, deviceIds, LearnerProfileStore(context)) {}
    private val heard = File(context.cacheDir, KEPT_RECORDINGS_DIRECTORY)

    private fun aRecordingIsCached() = File(heard, "one.wav").apply {
        parentFile?.mkdirs()
        writeText("a child's voice")
    }

    @Test
    fun `leaving a learner removes the recordings fetched to hear`() = runBlocking {
        val file = aRecordingIsCached()

        wipe.leaveLearner()

        assertFalse(file.exists())
        assertFalse(heard.exists())
    }

    @Test
    fun `signing out removes the recordings fetched to hear`() = runBlocking {
        val file = aRecordingIsCached()

        wipe.wipeDevice()

        assertFalse(file.exists())
        assertTrue(accounts.account.value == null)
    }
}
