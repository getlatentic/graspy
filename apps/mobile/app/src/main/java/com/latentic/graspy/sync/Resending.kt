package com.latentic.graspy.sync

import com.latentic.graspy.mcp.bestEffort
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge

/**
 * Sends what a learner did on the phone while the app is started and there is a connection, as the web sends it
 * on start and on reconnect: at once when both hold, and again after a wait each time something is kept. What is
 * kept with the server failing stays on the phone, so it is tried again after waits that double up to
 * [longestWaitMillis], [tries] times in all. Past those it stays kept, never lost: the next thing kept, the next
 * reconnect or start, and the next leave (UnsentWork) each send it.
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
    private val tries: Int = TRIES,
    private val pause: suspend (Long) -> Unit = ::delay,
) {
    /** Runs until cancelled; the app stopped or the connection lost stops the tries until both are back. */
    suspend fun whileSeen(online: Flow<Boolean>, started: Flow<Boolean>) =
        combine(online, started) { reachable, seen -> reachable && seen }.distinctUntilChanged().collectLatest { sending ->
            if (sending) merge(flowOf(NO_WAIT), kept.map { firstWaitMillis }).conflate().collect { sendInTries(it) }
        }

    private suspend fun sendInTries(firstWait: Long) {
        for (wait in waits(firstWait)) {
            if (wait > NO_WAIT) pause(wait)
            if (sent()) return
        }
    }

    /** The wait before each try: [firstWait] before the first, then doubling from [firstWaitMillis]. */
    private fun waits(firstWait: Long): Sequence<Long> =
        sequenceOf(firstWait) + generateSequence(firstWaitMillis) { (it * 2).coerceAtMost(longestWaitMillis) }.take(tries - 1)

    private suspend fun sent(): Boolean = bestEffort(TAG, "Sending $what") { sentEverything() } ?: false

    private companion object {
        const val TAG = "GraspySending"
        const val NO_WAIT = 0L

        /** A server failing for a moment is usually back within this. */
        const val FIRST_WAIT_MILLIS = 15_000L

        /** A server failing for longer is asked no more often than this. */
        const val LONGEST_WAIT_MILLIS = 300_000L

        /** Waits of 15 s to 4 min: about eight minutes of a server failing before the calls wait for the next occasion. */
        const val TRIES = 6
    }
}
