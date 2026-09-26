package com.latentic.graspy

import android.os.Looper
import org.robolectric.Shadows.shadowOf

/**
 * Runs Robolectric's main thread until [done], failing after [timeoutMs] rather than hanging. View models
 * resume on the main thread, which runs only when a test lets it.
 */
fun settleMain(timeoutMs: Long = 5_000, done: () -> Boolean) {
    val until = System.currentTimeMillis() + timeoutMs
    while (!done()) {
        check(System.currentTimeMillis() < until) { "Still waiting after $timeoutMs ms" }
        shadowOf(Looper.getMainLooper()).idle()
        Thread.sleep(POLL_MS)
    }
    shadowOf(Looper.getMainLooper()).idle()
}

private const val POLL_MS = 10L
