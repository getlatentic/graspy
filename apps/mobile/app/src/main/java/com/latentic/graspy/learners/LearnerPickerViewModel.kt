package com.latentic.graspy.learners

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.account.UnsentChanges
import com.latentic.graspy.account.refusalCode
import com.latentic.graspy.collection.outbox.AppGraph
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ChoiceProblem { UNSENT, FULL, FAILED }

fun choiceProblem(error: Throwable): ChoiceProblem = when {
    error is UnsentChanges -> ChoiceProblem.UNSENT
    refusalCode(error) == "too_many_learners" -> ChoiceProblem.FULL
    else -> ChoiceProblem.FAILED
}

data class PickerState(
    /** Null while they load. */
    val learners: List<LearnerDto>? = null,
    val loadFailed: Boolean = false,
    val adding: Boolean = false,
    val busy: Boolean = false,
    val problem: ChoiceProblem? = null,
    val deviceHoldsLearning: Boolean = false,
)

/** "Who's learning?": the account's learners, one of whom the device learns as. */
class LearnerPickerViewModel(application: Application) : AndroidViewModel(application) {
    private val account = AppGraph.account(application)
    private val mutableState = MutableStateFlow(PickerState())
    private var loadedFor: String? = null

    val state = mutableState.asStateFlow()

    /** Another account's learners are never shown while this one's load. */
    fun load() {
        val current = account.accounts.account.value ?: return
        if (loadedFor != current.uid) mutableState.value = PickerState()
        loadedFor = current.uid
        mutableState.update { it.copy(loadFailed = false) }
        viewModelScope.launch {
            try {
                val learners = account.directory.list()
                mutableState.update { it.copy(learners = learners) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Listing the learners failed", error)
                mutableState.update { it.copy(loadFailed = true) }
            }
        }
        if (current.deviceJoins) {
            viewModelScope.launch {
                val holds = account.deviceLearning.holds(current.uid)
                mutableState.update { it.copy(deviceHoldsLearning = holds) }
            }
        }
    }

    fun startAdding() = mutableState.update { it.copy(adding = true, problem = null) }

    fun stopAdding() = mutableState.update { it.copy(adding = false) }

    fun choose(learner: LearnerDto, onChosen: () -> Unit) = run(onChosen) { account.choice.choose(learner) }

    fun addAndChoose(name: String, onChosen: () -> Unit) = run(onChosen) { account.choice.addAndChoose(name) }

    fun leaveForAnotherAccount() {
        viewModelScope.launch { account.entry.leaveForAnotherAccount() }
    }

    private fun run(onChosen: () -> Unit, pick: suspend () -> Unit) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, problem = null) }
        viewModelScope.launch {
            try {
                pick()
                mutableState.update { it.copy(busy = false, adding = false) }
                onChosen()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Choosing the learner failed", error)
                mutableState.update { it.copy(busy = false, problem = choiceProblem(error)) }
                // A learner added before the choice failed is on the account now, so the tiles must show them.
                load()
            }
        }
    }

    private companion object {
        const val TAG = "GraspyLearners"
    }
}
