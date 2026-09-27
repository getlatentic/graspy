package com.latentic.graspy.account

import com.latentic.graspy.localization.LearnerProfileStore

/** Lists, renames and removes the account's learners, and deletes the account. */
class LearnerDirectory(
    private val api: AccountApi,
    private val accounts: AccountStore,
    private val profiles: LearnerProfileStore,
    private val leaveLearner: suspend () -> Unit,
    /** Signs out the account with that uid, if the device still holds it. */
    private val signOut: suspend (uid: String) -> Unit,
) {
    suspend fun list(): List<LearnerDto> = api.learners().learners

    suspend fun rename(id: String, name: String): LearnerDto {
        val renamed = api.rename(id, LearnerNameDto(name))
        if (accounts.account.value?.learner?.id == id) accounts.setLearner(ChosenLearner(id, renamed.name))
        return renamed
    }

    /** True when the device was learning as them: it has left them, and must ask who is learning. */
    suspend fun remove(id: String): Boolean {
        api.remove(id)
        val account = accounts.account.value ?: return false
        profiles.forget(learnerKey(account.uid, id))
        val inUse = account.learner?.id == id
        if (inUse) leaveLearner()
        return inUse
    }

    /**
     * Signs out the account deleted and no other: a refusal may have signed it out while graspy deleted it, and
     * someone else signed in since.
     */
    suspend fun deleteAccount() {
        val uid = accounts.account.value?.uid ?: throw SessionRefusal("Nobody is signed in on this device")
        api.delete()
        signOut(uid)
    }
}
