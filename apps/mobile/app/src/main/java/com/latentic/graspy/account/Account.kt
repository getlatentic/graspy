package com.latentic.graspy.account

/** The account's learner this device learns as. */
data class ChosenLearner(val id: String, val name: String)

/** Who is signed in on this device, and which of the account's learners it learns as. */
data class Account(
    val uid: String,
    val email: String?,
    /** Null until one is chosen on "Who's learning?". */
    val learner: ChosenLearner?,
    /** Until the first learner is chosen after signing in, the device's own learning joins that learner. */
    val deviceJoins: Boolean,
) {
    /** The owner of the learner's rows, files and preferences on this device. */
    val learnerKey: String? get() = learner?.let { learnerKey(uid, it.id) }
}

/** Learner ids are unique within an account, so the account's uid is part of the key. */
fun learnerKey(uid: String, learnerId: String): String = "$uid/$learnerId"
