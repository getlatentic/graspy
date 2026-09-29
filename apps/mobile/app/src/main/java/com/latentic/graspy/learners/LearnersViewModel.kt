package com.latentic.graspy.learners

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.collection.outbox.AppGraph
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LearnersState(
    /** Null while they load. */
    val learners: List<LearnerDto>? = null,
    val busy: Boolean = false,
    val failed: Boolean = false,
)

/** The server answers a rename with the learner but not the consents held for them, so only the name is taken from it. */
internal fun LearnersState.renamed(renamed: LearnerDto) =
    copy(learners = learners?.map { if (it.id == renamed.id) it.copy(name = renamed.name) else it })

/** Renames and removes the account's learners, and deletes the account. */
class LearnersViewModel(application: Application) : AndroidViewModel(application) {
    private val account = AppGraph.account(application)
    private val mutableState = MutableStateFlow(LearnersState())

    private var loadedFor: String? = null

    val state = mutableState.asStateFlow()

    /** Another account's learners are never shown while this one's load. */
    fun load() {
        val uid = account.accounts.account.value?.uid ?: return
        if (loadedFor != uid) mutableState.value = LearnersState()
        loadedFor = uid
        mutableState.update { it.copy(failed = false) }
        viewModelScope.launch {
            attempt { mutableState.update { it.copy(learners = account.directory.list()) } }
        }
    }

    fun rename(id: String, name: String, onSaved: () -> Unit) = act {
        val renamed = account.directory.rename(id, name)
        mutableState.update { it.renamed(renamed) }
        onSaved()
    }

    /** Removing the learner in use leaves them, and the device asks who is learning. */
    fun remove(id: String, onLeft: () -> Unit) = act {
        if (account.directory.remove(id)) onLeft() else load()
    }

    fun deleteAccount() = act { account.directory.deleteAccount() }

    private fun act(work: suspend () -> Unit) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, failed = false) }
        viewModelScope.launch {
            attempt(work)
            mutableState.update { it.copy(busy = false) }
        }
    }

    private suspend fun attempt(work: suspend () -> Unit) {
        try {
            work()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Changing the account's learners failed", error)
            mutableState.update { it.copy(failed = true) }
        }
    }

    private companion object {
        const val TAG = "GraspyLearners"
    }
}
