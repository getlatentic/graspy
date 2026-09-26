package com.latentic.graspy.account

import android.content.Context
import androidx.core.content.edit
import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import com.latentic.graspy.collection.outbox.GraspyDatabase
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.practice.TEACHER_AUDIO_DIRECTORY
import com.latentic.graspy.practice.forgetReplies
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** A device shared by a family or a school keeps nothing of one learner for the next. */
class DeviceWipe(
    private val context: Context,
    private val database: GraspyDatabase,
    private val accounts: AccountStore,
    private val sessions: SessionTokens,
    private val deviceIds: DeviceIdStore,
    private val profiles: LearnerProfileStore,
    private val cancelWork: () -> Unit,
) {
    /**
     * Everything the learner in use kept here goes: their lessons, answers, recordings, her replies
     * to them, and their preferences. The account stays signed in with no learner chosen, and each
     * learner's class and language stay for when they learn here again.
     */
    suspend fun leaveLearner() = withContext(Dispatchers.IO) {
        // The learner goes first, so whatever still runs for them finds them gone and writes nothing the wipe misses.
        accounts.setLearner(null)
        sessions.forget()
        forgetLearnerData()
    }

    /** Signed out: nothing of the account or any learner stays, and the device takes a new id. */
    suspend fun wipeDevice() = withContext(Dispatchers.IO) {
        accounts.set(null)
        sessions.forget()
        forgetLearnerData()
        profiles.forgetAll()
        File(context.cacheDir, TEACHER_AUDIO_DIRECTORY).deleteRecursively()
        deviceIds.renew()
    }

    private fun forgetLearnerData() {
        cancelWork()
        database.clearAllTables()
        PreferenceFiles.learnerData.forEach { context.getSharedPreferences(it, 0).edit(commit = true) { clear() } }
        File(context.filesDir, RECORDINGS_DIRECTORY).deleteRecursively()
        forgetReplies(File(context.cacheDir, TEACHER_AUDIO_DIRECTORY))
    }
}
