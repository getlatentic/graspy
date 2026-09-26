package com.latentic.graspy.plan

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** A record as the server gave it, and when it was asked for: it can know nothing kept on the phone after [askedAt]. */
data class RecordRead(val plan: LearnerPlan, val record: LearnerRecord, val askedAt: Long)

/**
 * The learner's record on a plan: the server's when it answers, else the one already known. Each record
 * the server gives is told to [read], even one equal to the last, as the web copies lessons on every
 * read; one kept on the phone or assumed never is. The last is told again to whoever starts listening.
 */
class ServerRecords(
    private val clock: () -> Long = System::currentTimeMillis,
    private val fetch: suspend (planId: String) -> LearnerRecord?,
) {
    private val served = MutableSharedFlow<RecordRead>(replay = 1, extraBufferCapacity = 1)

    val read: SharedFlow<RecordRead> = served.asSharedFlow()

    suspend fun ready(plan: LearnerPlan, known: LearnerRecord? = null): PlanState.Ready {
        val askedAt = clock()
        val fetched = fetch(plan.planId)
        if (fetched != null) served.emit(RecordRead(plan, fetched, askedAt))
        return PlanState.Ready(plan, fetched ?: known ?: LearnerRecord())
    }
}
