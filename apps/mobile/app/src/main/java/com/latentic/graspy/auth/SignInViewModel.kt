package com.latentic.graspy.auth

import android.app.Activity
import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.collection.outbox.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SignInState(val busy: Boolean = false, val failed: Boolean = false)

/** Signing in opens "Who's learning?" once Google and graspy have both answered. */
class SignInViewModel(application: Application) : AndroidViewModel(application) {
    private val entry = AppGraph.account(application).entry
    private val mutableState = MutableStateFlow(SignInState())

    val state = mutableState.asStateFlow()

    /** [activity] shows Google's account sheet or its sign-in page; it is used for this call only, never kept. */
    fun signIn(activity: Activity) {
        if (mutableState.value.busy) return
        mutableState.value = SignInState(busy = true)
        viewModelScope.launch {
            mutableState.value = SignInState(failed = failed(entry.signIn(activity)))
        }
    }

    /** Closing the account sheet or Google's page needs no message. */
    private fun failed(outcome: SignInOutcome): Boolean = when (outcome) {
        is SignInOutcome.Succeeded, SignInOutcome.Cancelled -> false
        is SignInOutcome.Failed -> true.also { Log.w(TAG, "Signing in failed: ${outcome.reason}") }
    }

    private companion object {
        const val TAG = "GraspySignIn"
    }
}
