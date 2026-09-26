package com.latentic.graspy.auth

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.collection.outbox.AppGraph
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class SignInProblem { NO_GOOGLE_ACCOUNT, FAILED }

data class SignInState(val busy: Boolean = false, val problem: SignInProblem? = null)

/** Signing in opens "Who's learning?" once Google and graspy have both answered. */
class SignInViewModel(application: Application) : AndroidViewModel(application) {
    private val entry = AppGraph.account(application).entry
    private val mutableState = MutableStateFlow(SignInState())

    val state = mutableState.asStateFlow()

    fun signIn() {
        if (mutableState.value.busy) return
        mutableState.value = SignInState(busy = true)
        viewModelScope.launch {
            mutableState.value = SignInState(problem = problemOf(entry.signIn()))
        }
    }

    /** Null when the learner closed the account sheet, which needs no message. */
    private fun problemOf(outcome: SignInOutcome): SignInProblem? = when (outcome) {
        is SignInOutcome.Succeeded, SignInOutcome.Cancelled -> null
        SignInOutcome.NoAccountAvailable -> SignInProblem.NO_GOOGLE_ACCOUNT
        is SignInOutcome.Failed -> SignInProblem.FAILED.also { Log.w(TAG, "Signing in failed: ${outcome.reason}") }
    }

    private companion object {
        const val TAG = "GraspySignIn"
    }
}
