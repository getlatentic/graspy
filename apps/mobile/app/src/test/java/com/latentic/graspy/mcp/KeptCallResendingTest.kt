package com.latentic.graspy.mcp

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A view call kept while online, the server failing, is sent again without waiting for a reconnect, a few times
 * and only while the app is started, as the web sends its kept calls on start and on reconnect.
 */
@RunWith(RobolectricTestRunner::class)
class KeptCallResendingTest {
    private val online = MutableStateFlow(true)
    private val started = MutableStateFlow(true)
    private val kept = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    private val waits = mutableListOf<Long>()
    private var sends = 0

    /** Answers each send from [answers] in turn, then says everything was sent. */
    private fun resending(vararg answers: Boolean, pause: suspend (Long) -> Unit = { waits += it }): KeptCallResending {
        val left = ArrayDeque(answers.toList())
        return KeptCallResending(
            sentEverything = { sends += 1; left.removeFirstOrNull() ?: true },
            kept = kept,
            firstWaitMillis = 10,
            longestWaitMillis = 40,
            tries = 5,
            pause = pause,
        )
    }

    /** A server that never takes the calls, as a proxy's 413 or a lasting 403 leaves them. */
    private fun neverTaken() = KeptCallResending(
        sentEverything = { sends += 1; false },
        kept = kept,
        firstWaitMillis = 10,
        longestWaitMillis = 40,
        tries = 3,
        pause = { waits += it },
    )

    @Test
    fun `with a connection, the kept calls are sent at once`() = runBlocking {
        val run = launch { resending().whileSeen(online, started) }

        settle { sends == 1 }
        run.cancel()
        assertEquals(emptyList<Long>(), waits)
    }

    @Test
    fun `while some stay kept, they are tried again after waits that double up to the longest`() = runBlocking {
        val run = launch { resending(false, false, false, false).whileSeen(online, started) }

        settle { sends == 5 }
        run.cancel()
        assertEquals(listOf(10L, 20L, 40L, 40L), waits)
    }

    @Test
    fun `calls the server never takes are tried a few times, then wait for the next call kept`() = runBlocking {
        val run = launch { neverTaken().whileSeen(online, started) }
        settle { sends == 3 }
        repeat(20) { yield() }
        assertEquals(3, sends)
        assertEquals(listOf(10L, 20L), waits)

        kept.emit(Unit)

        settle { sends == 6 }
        repeat(20) { yield() }
        assertEquals(6, sends)
        assertEquals(listOf(10L, 20L, 10L, 10L, 20L), waits)
        run.cancel()
    }

    @Test
    fun `calls the server never takes are tried again at once when the connection comes back`() = runBlocking {
        val run = launch { neverTaken().whileSeen(online, started) }
        settle { sends == 3 }

        online.value = false
        repeat(10) { yield() }
        online.value = true

        settle { sends == 6 }
        run.cancel()
        assertEquals(listOf(10L, 20L, 10L, 20L), waits)
    }

    @Test
    fun `a failed send is tried again as one not yet sent`() = runBlocking {
        var failed = false
        val sending = KeptCallResending(
            sentEverything = { sends += 1; if (!failed) { failed = true; error("the outbox could not be read") }; true },
            kept = kept,
            firstWaitMillis = 10,
            pause = { waits += it },
        )
        val run = launch { sending.whileSeen(online, started) }

        settle { sends == 2 }
        run.cancel()
        assertEquals(listOf(10L), waits)
    }

    @Test
    fun `a call kept while online is sent after the first wait, without waiting for a reconnect`() = runBlocking {
        val run = launch { resending().whileSeen(online, started) }
        settle { sends == 1 }

        kept.emit(Unit)

        settle { sends == 2 }
        run.cancel()
        assertEquals(listOf(10L), waits)
    }

    @Test
    fun `offline nothing is sent until the connection is back`() = runBlocking {
        online.value = false
        val run = launch { resending().whileSeen(online, started) }
        repeat(10) { yield() }
        kept.emit(Unit)
        repeat(10) { yield() }
        assertEquals(0, sends)

        online.value = true

        settle { sends == 1 }
        run.cancel()
    }

    @Test
    fun `losing the connection stops the tries`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val run = launch { resending(false, pause = { waits += it; gate.await() }).whileSeen(online, started) }
        settle { waits.size == 1 }

        online.value = false
        repeat(10) { yield() }
        gate.complete(Unit)
        repeat(10) { yield() }

        assertEquals(1, sends)
        run.cancel()
    }

    @Test
    fun `in the background nothing is sent, and the tries stop until the app is started again`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val run = launch { resending(false, pause = { waits += it; gate.await() }).whileSeen(online, started) }
        settle { waits.size == 1 }

        started.value = false
        repeat(10) { yield() }
        gate.complete(Unit)
        kept.emit(Unit)
        repeat(10) { yield() }
        assertEquals(1, sends)

        started.value = true

        settle { sends == 2 }
        run.cancel()
    }

    private suspend fun settle(done: () -> Boolean) = withTimeout(5_000) { while (!done()) yield() }
}
