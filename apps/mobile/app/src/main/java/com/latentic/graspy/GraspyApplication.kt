package com.latentic.graspy

import android.app.Application
import com.latentic.graspy.auth.AuthEmulator
import com.latentic.graspy.collection.outbox.AppGraph
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class GraspyApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        AuthEmulator.connect()
        val account = AppGraph.account(this)
        account.entry.reconcile(applicationScope)
        val learner = account.learnerInUse() ?: return
        applicationScope.launch {
            AppGraph.submissionRepository(this@GraspyApplication).recoverIncomplete(learner)
        }
    }
}
