package com.latentic.graspy.mcp

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.merge

/**
 * Sends a learner's kept view calls while there is a connection: once it comes, and again each time a call is
 * kept. A call kept online, with the server failing, stays on the phone, so while some do it tries again after
 * a wait that doubles up to [longestWaitMillis] instead of leaving them until the connection comes back.
 */
class KeptCallResending(
    /** Sends the kept calls; false while some are still on the phone. */
    private val sentEverything: suspend () -> Boolean,
    /** Tells each time a call is kept. */
    private val kept: Flow<Unit>,
    private val firstWaitMillis: Long = FIRST_WAIT_MILLIS,
    private val longestWaitMillis: Long = LONGEST_WAIT_MILLIS,
    private val pause: suspend (Long) -> Unit = ::delay,
) {
    /** Runs until cancelled; losing the connection stops the tries until it is back. */
    suspend fun whileOnline(online: Flow<Boolean>) = online.collectLatest { reachable ->
        if (reachable) merge(flowOf(Unit), kept).conflate().collect { sendUntilNoneKept() }
    }

    private suspend fun sendUntilNoneKept() {
        var wait = firstWaitMillis
        while (!sent()) {
            pause(wait)
            wait = (wait * 2).coerceAtMost(longestWaitMillis)
        }
    }

    private suspend fun sent(): Boolean = bestEffort(TAG, "Sending the kept view calls") { sentEverything() } ?: false

    private companion object {
        const val TAG = "GraspyViews"

        /** A server failing for a moment is usually back within this. */
        const val FIRST_WAIT_MILLIS = 15_000L

        /** A server failing for longer is asked no more often than this. */
        const val LONGEST_WAIT_MILLIS = 300_000L
    }
}
