package com.latentic.graspy.account

import com.latentic.graspy.mcp.bestEffort
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map

/**
 * Runs [work] for the learner in use each time there is one whose parent has agreed: at start, once the parent agrees
 * for a learner already in use, and when another is chosen. What waited for the agreement, such as answers kept on
 * the phone, is sent then and not before. Runs until cancelled; a learner not agreed for starts nothing.
 */
suspend fun AccountStore.whenLearnerAgreed(work: suspend (learnerKey: String) -> Unit) =
    account.map { it?.agreedLearnerKey }.distinctUntilChanged().filterNotNull().collectLatest { learner ->
        // A failure of one learner's work is logged, and the watch goes on for the next agreement.
        bestEffort(TAG, "Sending what waited for the agreement") { work(learner) }
    }

private const val TAG = "GraspyAgreed"

