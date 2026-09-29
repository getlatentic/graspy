package com.latentic.graspy

import android.app.Application
import com.latentic.graspy.account.whenLearnerAgreed
import com.latentic.graspy.auth.AuthEmulator
import com.latentic.graspy.auth.dropStoredBrowserSignIn
import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.sweepOrphanRecordings
import com.latentic.graspy.mcp.bestEffort
import com.latentic.graspy.recordings.KEPT_RECORDINGS_DIRECTORY
import com.latentic.graspy.recordings.forgetKeptRecordings
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class GraspyApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val startedAt = System.currentTimeMillis()

    override fun onCreate() {
        super.onCreate()
        dropStoredBrowserSignIn(this)
        AuthEmulator.connect()
        val account = AppGraph.account(this)
        account.entry.reconcile(applicationScope)
        // A recording fetched to play, and left by a screen that was killed, is a child's voice: none stays.
        applicationScope.launch {
            bestEffort(TAG, "Removing kept recordings left in the cache") {
                forgetKeptRecordings(File(cacheDir, KEPT_RECORDINGS_DIRECTORY))
            }
        }
        applicationScope.launch {
            bestEffort(TAG, "Removing recordings no answer holds") {
                sweepOrphanRecordings(AppGraph.database(this@GraspyApplication).submissionDao(), File(filesDir, RECORDINGS_DIRECTORY), startedAt)
            }
        }
        // Answers kept on the phone are sent only once a parent has agreed for their learner: at start if they
        // have, and at once when they agree later.
        applicationScope.launch {
            account.accounts.whenLearnerAgreed { learner ->
                AppGraph.submissionRepository(this@GraspyApplication).recoverIncomplete(learner)
            }
        }
    }
}

private const val TAG = "GraspyApp"
