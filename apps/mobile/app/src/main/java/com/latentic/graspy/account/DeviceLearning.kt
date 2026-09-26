package com.latentic.graspy.account

import androidx.room.withTransaction
import com.latentic.graspy.collection.outbox.GraspyDatabase
import com.latentic.graspy.localization.LearnerProfileStore

/**
 * What this device learned before accounts held learners: answers and lessons kept under the
 * signed-in account itself, and the class and language chosen then. The first learner chosen after
 * signing in takes them; anything another account left here goes.
 */
class DeviceLearning(
    private val database: GraspyDatabase,
    private val profiles: LearnerProfileStore,
) {
    suspend fun holds(uid: String): Boolean =
        profiles.holdsDeviceProfile() ||
            database.submissionDao().holdsAny(uid) ||
            database.lessonCacheDao().holdsAny(uid)

    suspend fun claim(uid: String, learnerKey: String) {
        database.withTransaction {
            database.submissionDao().claim(uid, learnerKey)
            database.submissionDao().keepOnly(learnerKey)
            database.lessonCacheDao().claim(uid, learnerKey)
        }
        profiles.claimDeviceProfile(learnerKey)
    }
}
