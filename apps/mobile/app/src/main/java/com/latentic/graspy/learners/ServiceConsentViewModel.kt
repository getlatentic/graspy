package com.latentic.graspy.learners

import android.app.Activity
import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.account.ServiceConsents
import com.latentic.graspy.auth.ParentConfirmation
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.consent.Agreement
import com.latentic.graspy.consent.ConsentProblem
import com.latentic.graspy.consent.agree
import com.latentic.graspy.consent.problem
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ServiceConsentState(
    /** Asking graspy whether a parent has agreed for the learner in use. */
    val checking: Boolean = true,
    val checkFailed: Boolean = false,
    val busy: Boolean = false,
    val problem: ConsentProblem? = null,
)

/**
 * The learner this device already learned as when consent began has no parent's agreement on this device: it is
 * looked up, and asked for if graspy holds none. Once it is held the learner opens.
 */
class ServiceConsentViewModel internal constructor(
    application: Application,
    private val consents: ServiceConsents,
    private val confirmation: ParentConfirmation,
) : AndroidViewModel(application) {
    constructor(application: Application) : this(
        application,
        AppGraph.account(application).serviceConsents,
        AppGraph.account(application).parentConfirmation,
    )

    private val mutableState = MutableStateFlow(ServiceConsentState())

    val state = mutableState.asStateFlow()

    fun check() {
        mutableState.value = ServiceConsentState()
        viewModelScope.launch {
            try {
                consents.check()
                mutableState.update { it.copy(checking = false) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Asking whether a parent agreed failed", error)
                mutableState.update { it.copy(checking = false, checkFailed = true) }
            }
        }
    }

    /** The parent signs in with Google again over [activity] and agrees; it is used for this call only. */
    fun agree(activity: Activity) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, problem = null) }
        viewModelScope.launch {
            var problem: ConsentProblem? = ConsentProblem.FAILED
            try {
                val agreement = confirmation.agree(activity) { consents.agree(it) }
                if (agreement is Agreement.Failed) Log.w(TAG, "The parent's agreement was not recorded", agreement.error)
                problem = agreement.problem()
            } finally {
                mutableState.update { it.copy(busy = false, problem = problem) }
            }
        }
    }

    private companion object {
        const val TAG = "GraspyConsent"
    }
}
