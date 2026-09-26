package com.latentic.graspy.account

import com.latentic.graspy.localization.LearnerProfileStore
import retrofit2.HttpException

/** Lists, renames and removes the account's learners, and deletes the account. */
class LearnerDirectory(
    private val api: AccountApi,
    private val accounts: AccountStore,
    private val profiles: LearnerProfileStore,
    private val leaveLearner: suspend () -> Unit,
    private val signOut: suspend () -> Unit,
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

    suspend fun deleteAccount() {
        api.delete()
        signOut()
    }
}

/** The server's code for a refusal, such as `too_many_learners`. Peeked, so the body is still there to read. */
fun refusalCode(error: Throwable): String? {
    val body = (error as? HttpException)?.response()?.errorBody()?.source()?.peek()?.readUtf8() ?: return null
    return REFUSAL_CODE.find(body)?.groupValues?.get(1)
}

private val REFUSAL_CODE = Regex(""""code"\s*:\s*"([a-z_]+)"""")
