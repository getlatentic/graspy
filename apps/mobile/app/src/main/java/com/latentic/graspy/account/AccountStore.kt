package com.latentic.graspy.account

import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The account signed in on this device, kept beside Firebase's own copy of the sign-in. */
class AccountStore(private val preferences: SharedPreferences) {
    private val current = MutableStateFlow(read())

    val account: StateFlow<Account?> = current.asStateFlow()

    fun set(account: Account?) {
        write(account)
        current.value = account
    }

    /** Choosing a learner ends the device's joining; leaving one does not start it again. */
    fun setLearner(learner: ChosenLearner?) {
        val account = current.value ?: return
        set(account.copy(learner = learner, deviceJoins = learner == null && account.deviceJoins))
    }

    private fun read(): Account? {
        val uid = preferences.getString(UID, null) ?: return null
        val learnerId = preferences.getString(LEARNER_ID, null)
        val learnerName = preferences.getString(LEARNER_NAME, null)
        return Account(
            uid = uid,
            email = preferences.getString(EMAIL, null),
            learner = if (learnerId != null && learnerName != null) {
                ChosenLearner(learnerId, learnerName, preferences.getBoolean(LEARNER_CONSENTED, false))
            } else {
                null
            },
            deviceJoins = preferences.getBoolean(DEVICE_JOINS, learnerId == null),
        )
    }

    private fun write(account: Account?) {
        preferences.edit(commit = true) {
            clear()
            if (account != null) {
                putString(UID, account.uid)
                putString(EMAIL, account.email)
                putString(LEARNER_ID, account.learner?.id)
                putString(LEARNER_NAME, account.learner?.name)
                putBoolean(LEARNER_CONSENTED, account.learner?.consented ?: false)
                putBoolean(DEVICE_JOINS, account.deviceJoins)
            }
        }
    }

    private companion object {
        const val UID = "uid"
        const val EMAIL = "email"
        const val LEARNER_ID = "learner_id"
        const val LEARNER_NAME = "learner_name"
        const val LEARNER_CONSENTED = "learner_consented"
        const val DEVICE_JOINS = "device_joins"
    }
}
