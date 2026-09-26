package com.latentic.graspy.ui

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Where a signed-in device is: learning, choosing who learns, or managing the account's learners. */
enum class AccountScreen { LEARNING, PICKER, LEARNERS }

/** Kept outside the screens, so a choice that finishes after a rotation still lands where it should. */
class AccountScreens : ViewModel() {
    private val shown = MutableStateFlow(AccountScreen.LEARNING)

    val screen: StateFlow<AccountScreen> = shown.asStateFlow()

    fun show(screen: AccountScreen) {
        shown.value = screen
    }
}
