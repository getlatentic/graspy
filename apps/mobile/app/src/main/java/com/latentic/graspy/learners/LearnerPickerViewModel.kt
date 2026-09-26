package com.latentic.graspy.learners

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.account.UnsentChanges
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.network.refusalCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** [UNSENT] asks whether to switch anyway; the others only say why nothing changed. */
enum class ChoiceProblem { OFFLINE, UNSENT, FULL, FAILED }

fun choiceProblem(error: Throwable): ChoiceProblem = when {
    error is UnsentChanges -> if (error.offline) ChoiceProblem.OFFLINE else ChoiceProblem.UNSENT
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
    /** Picked last, added already if it was new, so switching anyway never adds them twice. */
    private var chosen: LearnerDto? = null

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

    fun choose(learner: LearnerDto, onChosen: () -> Unit) = run(onChosen) { learner }

    fun addAndChoose(name: String, onChosen: () -> Unit) = run(onChosen) { account.choice.add(name) }

    /** Switches to the learner last picked though what the device holds has not all reached graspy. */
    fun anyway(onChosen: () -> Unit) {
        val learner = chosen ?: return
        run(onChosen, loseUnsent = true) { learner }
    }

    fun cancel() = mutableState.update { it.copy(problem = null) }

    fun leaveForAnotherAccount() {
        viewModelScope.launch { account.entry.leaveForAnotherAccount() }
    }

    private fun run(onChosen: () -> Unit, loseUnsent: Boolean = false, pick: suspend () -> LearnerDto) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, problem = null) }
        viewModelScope.launch {
            try {
                val learner = pick()
                chosen = learner
                account.choice.choose(learner, loseUnsent)
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
