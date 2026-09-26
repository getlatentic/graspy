package com.latentic.graspy.mcp

import android.util.Log
import kotlinx.coroutines.CancellationException

/**
 * Work the learner did not ask for, such as keeping a copy for later: a failure is logged and the result
 * is null, so it never becomes why what they did ask for failed.
 */
suspend fun <T> bestEffort(tag: String, what: String, block: suspend () -> T): T? = try {
    block()
} catch (cancelled: CancellationException) {
    throw cancelled
} catch (failure: Exception) {
    Log.w(tag, "$what failed", failure)
    null
}
