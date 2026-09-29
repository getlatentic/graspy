package com.latentic.graspy.account

/**
 * Whether leaving [account]'s learner would lose answers not yet sent. A learner whose parent has agreed has them
 * sent first. For one whose parent has not, nothing is sent, whatever the device knows of the agreement: what is
 * queued for them would be wiped, so the parent is asked first.
 */
suspend fun leavingLosesAnswers(account: Account, outbox: Outbox, queued: suspend (learnerKey: String) -> Boolean): Boolean {
    val agreed = account.agreedLearnerKey
    if (agreed != null) return !outbox.flush(agreed)
    return account.learnerKey?.let { queued(it) } == true
}
