package com.latentic.graspy.sync

import androidx.work.WorkInfo
import retrofit2.HttpException

/** Where the single lesson refresh for a learner has got to. */
enum class RefreshState { RUNNING, SUCCEEDED, FAILED }

/**
 * Refreshes coalesce under one unique work name, so WorkManager reports at most one live attempt.
 * Nothing reported yet means the refresh has just been asked for.
 */
fun refreshState(attempts: List<WorkInfo.State>): RefreshState = when {
    attempts.isEmpty() -> RefreshState.RUNNING
    attempts.any { !it.isFinished } -> RefreshState.RUNNING
    attempts.any { it == WorkInfo.State.SUCCEEDED } -> RefreshState.SUCCEEDED
    else -> RefreshState.FAILED
}

/** Whether the step on screen is one the Worker has just issued, or one kept from an earlier day. */
enum class MoveOrigin { CACHED, ISSUED }

/**
 * The Worker binds a learner's progress to the step it gave out, so a step kept on the phone may be
 * shown but not answered. A step is issued when it was fetched no earlier than the refresh the app
 * is currently waiting for; every trigger that can change the step asks for a new one.
 */
fun moveOrigin(fetchedAtEpochMillis: Long, refreshRequestedAtEpochMillis: Long): MoveOrigin =
    if (fetchedAtEpochMillis >= refreshRequestedAtEpochMillis) MoveOrigin.ISSUED else MoveOrigin.CACHED

/** The Worker answers 409 when a step was not the one it issued; the phone must take a new one. */
fun stepWasNotOffered(error: HttpException): Boolean = error.code() == 409
