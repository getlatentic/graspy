package com.latentic.graspy.ui

import androidx.lifecycle.ViewModel
import com.latentic.graspy.account.LearnerDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Where a signed-in device is: learning, choosing who learns, managing the account's learners, or, from there, one
 * learner's voice recordings.
 */
enum class AccountScreen { LEARNING, PICKER, LEARNERS, RECORDINGS }

/** Kept outside the screens, so a choice that finishes after a rotation still lands where it should. */
class AccountScreens : ViewModel() {
    private val shown = MutableStateFlow(AccountScreen.LEARNING)
    private val recordings = MutableStateFlow<LearnerDto?>(null)

    val screen: StateFlow<AccountScreen> = shown.asStateFlow()

    /** The learner whose voice recordings [AccountScreen.RECORDINGS] shows. */
    val recordingsOf: StateFlow<LearnerDto?> = recordings.asStateFlow()

    fun show(screen: AccountScreen) {
        shown.value = screen
    }

    /** Signed out: the next account starts where a signed-in device does, and holds nothing of a learner's. */
    fun reset() {
        recordings.value = null
        shown.value = AccountScreen.LEARNING
    }

    fun showRecordingsOf(learner: LearnerDto) {
        recordings.value = learner
        shown.value = AccountScreen.RECORDINGS
    }
}
