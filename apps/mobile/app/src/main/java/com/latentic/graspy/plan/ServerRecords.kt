package com.latentic.graspy.plan

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * The learner's record on a plan: the server's when it answers, else the one already known. Each record
 * the server gives is told to [read], even one equal to the last, as the web copies lessons on every
 * read; one kept on the phone or assumed never is.
 */
class ServerRecords(private val fetch: suspend (planId: String) -> LearnerRecord?) {
    private val served = MutableSharedFlow<PlanState.Ready>(replay = 1, extraBufferCapacity = 1)

    val read: SharedFlow<PlanState.Ready> = served.asSharedFlow()

    suspend fun ready(plan: LearnerPlan, known: LearnerRecord? = null): PlanState.Ready {
        val fetched = fetch(plan.planId)
        val ready = PlanState.Ready(plan, fetched ?: known ?: LearnerRecord())
        if (fetched != null) served.emit(ready)
        return ready
    }
}
