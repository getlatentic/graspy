package com.latentic.graspy.ask

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** A turn read to its end across connections that drop, as the web's follow does (apps/web/src/lib/chat-turn). */
class TutorRunTest {
    private val servers = mutableListOf<ScriptedTurnServer>()
    private val quick = Timing(showReconnectingAfterMs = 60_000, readAgainMs = 0, backoffMs = { 0 }, longestTurnMs = 5_000)

    @After
    fun close() = servers.forEach { it.server.close() }

    private fun tutor(steps: List<Step> = TURN, setUp: ScriptedTurnServer.() -> Unit = {}): ScriptedTurnServer =
        ScriptedTurnServer(steps).apply(setUp).also { servers += it }

    private fun TutorRun.readOn(screen: Screen = Screen()): TutorReply = runBlocking { reply(screen) }

    private fun ask(server: ScriptedTurnServer, timing: Timing = quick): TutorRun {
        val client = TutorClient(OkHttpClient(), server.server.url("/a2a"), server.server.url("/api/chats"), timing)
        return client.start(TutorTurn("Teach me ratios", CHAT, JsonObject(emptyMap())))
    }

    private fun readUncut(): Pair<TutorReply, Screen> {
        val server = tutor()
        val screen = Screen()
        val reply = ask(server).readOn(screen)
        assertEquals(listOf("POST /a2a"), server.asked.map { "${it.method} ${it.path}" })
        return reply to screen
    }

    private fun messageIds(server: ScriptedTurnServer) =
        server.asked.filter { it.path == "/a2a" }.map { Regex(""""messageId":"([^"]+)"""").find(it.body)!!.groupValues[1] }

    @Test
    fun `a stream cut at every event of the turn, and every read cut at every frame, ends with the reply of an uncut turn`() {
        val (whole, shown) = readUncut()
        assertEquals("Hello again!", whole.text)
        assertEquals("Hello again", shown.text)
        assertEquals(listOf("Why?"), whole.followUps)
        for (a2aEvents in 0..TURN.size + 1) {
            for (framesPerRead in 1..TURN.size) {
                val label = "A2A cut after $a2aEvents events, $framesPerRead frames a read"
                val server = tutor { this.a2aEvents = a2aEvents; this.framesPerRead = framesPerRead }
                val screen = Screen()

                val reply = ask(server).readOn(screen)

                assertEquals(label, whole, reply)
                assertEquals(label, shown.text, screen.text)
                assertOneTurn(label, server)
            }
        }
    }

    @Test
    fun `what the first stream showed is withdrawn when the frames show the turn again`() {
        val whole = tutor(PLAIN).let { ask(it).readOn() }
        for (a2aEvents in 0..PLAIN.size + 1) {
            val screen = Screen()

            val reply = ask(tutor(PLAIN) { this.a2aEvents = a2aEvents }).readOn(screen)

            assertEquals("A2A cut after $a2aEvents events", whole, reply)
            assertEquals("A2A cut after $a2aEvents events", "Hello", screen.text)
        }
    }

    private fun assertOneTurn(label: String, server: ScriptedTurnServer) {
        val ids = messageIds(server).toSet()
        assertEquals(label, 1, ids.size)
        assertTrue(label, server.asked.filter { it.path == "/a2a" }.all { """"contextId":"$CHAT"""" in it.body })
        val reads = server.asked.filter { it.path.endsWith("/events") }
        assertTrue(label, reads.all { it.path == "/api/chats/$CHAT/turns/${ids.single()}/events" })
        val cursors = reads.map { it.lastEventId!!.toLong() }
        assertEquals(label, cursors.sorted(), cursors)
    }

    @Test
    fun `frames at or below the cursor are dropped, so a server that sends them again changes nothing`() {
        val (whole, shown) = readUncut()
        val server = tutor { a2aEvents = 0; overlap = true; framesPerRead = 2 }
        val screen = Screen()

        assertEquals(whole, ask(server).readOn(screen))
        assertEquals(shown.text, screen.text)
    }

    @Test
    fun `a lost frame is asked for again from the cursor`() {
        val (whole, _) = readUncut()
        val server = tutor { a2aEvents = 0; omitOnce = 9 }

        assertEquals(whole, ask(server).readOn())

        // The first read applied frames 7 and 8, found 10 without 9, and the next read began again at 8.
        assertEquals(listOf("0", "8"), server.asked.filter { it.path.endsWith("/events") }.map { it.lastEventId })
    }

    @Test
    fun `a message that began no turn is sent again with the same id`() {
        val (whole, _) = readUncut()
        val server = tutor { a2aEvents = 0; silentMessages = 1 }

        assertEquals(whole, ask(server).readOn())

        assertEquals(2, messageIds(server).size)
        assertEquals(1, messageIds(server).toSet().size)
    }

    @Test
    fun `a gateway error before the stream opens sends the same message again`() {
        val (whole, _) = readUncut()
        val server = tutor { a2aFailures += listOf(502, 503) }

        assertEquals(whole, ask(server).readOn())

        assertEquals(3, messageIds(server).size)
        assertEquals(1, messageIds(server).toSet().size)
    }

    @Test
    fun `a refusal says nothing was done and is not tried again`() {
        val server = tutor { a2aFailures += 400 }

        val failure = assertThrows(TutorUnreachable::class.java) { ask(server).readOn() }

        assertFalse(failure.retryable)
        assertEquals(1, server.asked.size)
    }

    @Test
    fun `the learner is told the connection is down only once it stays down, and told when it is back`() {
        val server = tutor { a2aEvents = 0; eventsFailures += listOf(503, 503, 503) }
        val screen = Screen()

        ask(server, Timing(showReconnectingAfterMs = 30, readAgainMs = 0, backoffMs = { 60 }, longestTurnMs = 5_000)).readOn(screen)

        assertEquals(listOf(true, false), screen.reconnecting)
    }

    @Test
    fun `a blink is not shown`() {
        val server = tutor { a2aEvents = 0; eventsFailures += 503 }
        val screen = Screen()

        ask(server).readOn(screen)

        assertEquals(emptyList<Boolean>(), screen.reconnecting)
    }

    @Test
    fun `a stopped turn returns the words it had, marked as stopped`() {
        val reply = ask(tutor(STOPPED) { a2aEvents = 1 }).readOn()

        assertEquals("Hel", reply.text)
        assertTrue(reply.stopped)
    }

    @Test
    fun `a turn that failed is an error with its cause, not a reply`() {
        val failure = assertThrows(TutorUnreachable::class.java) { ask(tutor(FAILED) { a2aEvents = 1 }).readOn() }

        assertFalse(failure.retryable)
        assertTrue(failure.message, "no_progress" in failure.message.orEmpty())
    }

    @Test
    fun `the stop is posted to the turn's stop route`() {
        val server = tutor()
        val run = ask(server)

        assertTrue(runBlocking { run.stop() })

        assertEquals("POST /api/chats/$CHAT/turns/${run.messageId}/stop", server.asked.single().let { "${it.method} ${it.path}" })
    }

    private class Screen : TurnListener {
        var text = ""
        val reconnecting = mutableListOf<Boolean>()

        override fun onDelta(text: String) {
            this.text += text
        }

        override fun onRestart() {
            text = ""
        }

        override fun onReconnecting(on: Boolean) {
            reconnecting += on
        }
    }

    private companion object {
        const val CHAT = "chat-0001"
        const val DATA = """{"followUps":["Why?"]}"""

        fun working(seq: Long, tool: String) = Step(
            """{"result":{"statusUpdate":{"status":{"state":"TASK_STATE_WORKING","message":{"role":"ROLE_AGENT","parts":[{"data":{"activity":"$tool"}}]}}}}}""",
            seq, "tool.started", ""","tool":"$tool"""",
        )

        fun words(seq: Long, text: String, append: Boolean) = Step(
            """{"result":{"artifactUpdate":{"artifact":{"artifactId":"answer","parts":[{"text":"$text"}]},"append":$append}}}""",
            seq, "text", ""","text":"$text"""",
        )

        fun aborted(seq: Long) = Step(
            """{"result":{"artifactUpdate":{"artifact":{"artifactId":"answer","parts":[{"text":""}]},"append":false}}}""",
            seq, "round.aborted", ""","reason":"cut_off"""",
        )

        fun finished(seq: Long, status: String, answer: String) = Step(
            """{"result":{"statusUpdate":{"status":{"state":"TASK_STATE_COMPLETED","message":{"role":"ROLE_AGENT","parts":[{"text":"$answer"},{"data":$DATA}]}}}}}""",
            seq, "turn.finished", ""","status":"$status","reply":{"answer":"$answer","data":$DATA}""",
        )

        // The turn's frames sit where they would in a chat that already held six events.
        val TURN = listOf(
            words(7, "Hel", append = false),
            working(8, "give_practice"),
            words(9, "lo", append = true),
            aborted(10),
            words(11, "Hello again", append = false),
            finished(12, "ok", "Hello again!"),
        )
        val PLAIN = listOf(words(7, "Hel", append = false), words(8, "lo", append = true), finished(9, "ok", "Hello"))
        val STOPPED = listOf(words(7, "Hel", append = false), finished(8, "stopped", "Hel"))
        val FAILED = listOf(
            words(7, "Hel", append = false),
            Step("{}", 8, "turn.finished", ""","status":"failed","cause":"no_progress""""),
        )
    }
}
