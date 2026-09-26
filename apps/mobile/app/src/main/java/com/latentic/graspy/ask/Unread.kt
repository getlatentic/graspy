package com.latentic.graspy.ask

/** Threads whose reply came while the learner looked elsewhere, as the web marks them; looking at one clears it. */
data class Unread(val threads: Set<String> = emptySet(), val viewing: String? = null) {
    fun answered(threadId: String): Unread = if (threadId == viewing) this else copy(threads = threads + threadId)

    fun lookingAt(threadId: String?): Unread = Unread(threadId?.let { threads - it } ?: threads, threadId)
}
