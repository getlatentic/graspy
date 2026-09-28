package com.latentic.graspy

import android.app.Application
import com.latentic.graspy.auth.AuthEmulator
import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.sweepOrphanRecordings
import com.latentic.graspy.mcp.bestEffort
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
        AuthEmulator.connect()
        val account = AppGraph.account(this)
        account.entry.reconcile(applicationScope)
        applicationScope.launch {
            bestEffort(TAG, "Removing recordings no answer holds") {
                sweepOrphanRecordings(AppGraph.database(this@GraspyApplication).submissionDao(), File(filesDir, RECORDINGS_DIRECTORY), startedAt)
            }
        }
        val learner = account.learnerInUse() ?: return
        applicationScope.launch {
            AppGraph.submissionRepository(this@GraspyApplication).recoverIncomplete(learner)
        }
    }
}

private const val TAG = "GraspyApp"
