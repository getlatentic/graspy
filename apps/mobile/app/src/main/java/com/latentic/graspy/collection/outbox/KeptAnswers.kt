package com.latentic.graspy.collection.outbox

import kotlinx.coroutines.flow.first

/** How many tries each answer [ownerId] still keeps has had. */
suspend fun SubmissionDao.triesSoFar(ownerId: String): Map<String, Int> =
    findIncomplete(ownerId).associate { it.localId to it.attemptCount }

/**
 * Waits until every answer [ownerId] keeps is marked or refused, or has had a try since [before] and was kept for a
 * failure; true when none is left. One not tried yet, being sent or still being marked is waited for. One its try
 * failed is not, as the web's sentEveryAnswer sends each answer once: it stays kept for WorkManager's next try, and
 * the leave asks at once instead of waiting out its patience on an answer that may never go.
 */
suspend fun SubmissionDao.awaitTried(ownerId: String, before: Map<String, Int>): Boolean =
    observeIncomplete(ownerId).first { kept -> kept.all { it.failedTrySince(before) } }.isEmpty()

/** Kept because its last try failed, not because it is still being marked. */
internal fun SubmissionEntity.lastTryFailed(): Boolean =
    status == SubmissionStatus.PENDING.name && failureReason != null && failureReason != STILL_BEING_CHECKED

internal fun SubmissionEntity.failedTrySince(before: Map<String, Int>): Boolean =
    lastTryFailed() && attemptCount > (before[localId] ?: 0)
