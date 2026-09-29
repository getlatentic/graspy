package com.latentic.graspy.auth

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.collection.outbox.AppGraph
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SignOutState(val busy: Boolean = false, val unsent: Boolean = false)

/** Sends what is unsent first; when it cannot, asks before losing it. */
class SignOutViewModel(application: Application) : AndroidViewModel(application) {
    private val account = AppGraph.account(application)
    private val mutableState = MutableStateFlow(SignOutState())

    val state = mutableState.asStateFlow()

    fun start() {
        if (mutableState.value.busy) return
        mutableState.value = SignOutState(busy = true)
        viewModelScope.launch {
            if (account.signOutLosesAnswers()) mutableState.value = SignOutState(unsent = true) else leave()
        }
    }

    fun anyway() {
        mutableState.value = SignOutState(busy = true)
        viewModelScope.launch { leave() }
    }

    fun cancel() {
        mutableState.value = SignOutState()
    }

    private suspend fun leave() {
        try {
            account.entry.signOut()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Signing out failed", error)
        }
        mutableState.value = SignOutState()
    }

    private companion object {
        const val TAG = "GraspySignOut"
    }
}
