package com.latentic.graspy.sync

import com.latentic.graspy.mcp.bestEffort
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.merge

/**
 * Sends what a learner did on the phone while there is a connection: once it comes, and again each time
 * something is kept. What is kept online, with the server failing, stays on the phone, so while some does it
 * tries again after a wait that doubles up to [longestWaitMillis] instead of leaving it until the connection
 * comes back.
 */
class Resending(
    /** What is sent, as the log names it. */
    private val what: String,
    /** Sends what is kept; false while some is still on the phone. */
    private val sentEverything: suspend () -> Boolean,
    /** Tells each time something is kept. */
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

    private suspend fun sent(): Boolean = bestEffort(TAG, "Sending $what") { sentEverything() } ?: false

    private companion object {
        const val TAG = "GraspySending"

        /** A server failing for a moment is usually back within this. */
        const val FIRST_WAIT_MILLIS = 15_000L

        /** A server failing for longer is asked no more often than this. */
        const val LONGEST_WAIT_MILLIS = 300_000L
    }
}
