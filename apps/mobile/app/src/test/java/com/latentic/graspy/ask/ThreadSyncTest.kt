package com.latentic.graspy.ask

import android.content.Context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.collection.outbox.retrofit
import java.io.IOException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** Graspy as the phone meets it: what it was sent, and the pages it answers with. */
private class FakeThreadsApi : ThreadsApi {
    val sent = mutableListOf<SentThreads>()
    val reads = mutableListOf<Triple<Long, Long?, String?>>()
    val pages = ArrayDeque<JsonObject>()
    var seq = 0L
    var reachable = true

    /** Runs as a request is answered, before the phone reads the answer. */
    var meanwhile: (suspend () -> Unit)? = null

    private suspend fun answer() {
        if (!reachable) throw IOException("no connection")
        meanwhile?.also { meanwhile = null }?.invoke()
    }

    override suspend fun keep(sent: SentThreads): KeptThreads {
        answer()
        this.sent += sent
        seq += 1
        return KeptThreads(seq)
    }

    override suspend fun changes(since: Long, upTo: Long?, after: String?): ThreadChanges {
        reads += Triple(since, upTo, after)
        answer()
        val page = pages.removeFirstOrNull() ?: buildJsonObject { put("upTo", seq) }
        return apiJson.decodeFromJsonElement(ThreadChanges.serializer(), page)
    }
}

/** A learner's conversations follow them to their other devices, and one learner's never reach another's. */
@RunWith(RobolectricTestRunner::class)
class ThreadSyncTest {
    private val context: Context = RuntimeEnvironment.getApplication()
    private val database = inMemoryDatabase()
    private val dao = database.chatDao()
    private val preferences = context.getSharedPreferences("threads-test", 0)
    private val api = FakeThreadsApi()
    private var learning = true
    private var now = 1_000L
    private val ada = ChatStore(dao, ADA) { now++ }
    private val sync = ThreadSync(dao, ADA, api, ThreadCursor(preferences, ADA), { learning })
    private val fractions = ThreadScope.Topic("plan-1", "mathematics", "Fractions")

    @After
    fun close() {
        database.close()
        preferences.edit().clear().commit()
    }

    private suspend fun asked(text: String, scope: ThreadScope = fractions): Pair<ChatThread, ChatMessage> {
        val thread = ada.ensureThread(scope)
        return thread to ada.add(thread.id, MessageKind.LEARNER, text)
    }

    private fun page(threads: List<JsonObject>, upTo: Long = api.seq, next: String? = null) = buildJsonObject {
        put("upTo", upTo)
        put("threads", buildJsonArray { threads.forEach { add(it) } })
        next?.let { put("next", it) }
    }

    private fun serverThread(id: String, messages: List<JsonObject>, updatedAt: Long = 2, context: String? = null, preview: String? = null) =
        buildJsonObject {
            put("id", id)
            putJsonObject("scope") {
                put("kind", "topic")
                put("planId", "plan-1")
                put("subjectSlug", "mathematics")
                put("topic", "Fractions")
            }
            context?.let { put("agentContextId", it) }
            preview?.let { put("preview", it) }
            put("createdAt", 1)
            put("updatedAt", updatedAt)
            putJsonArray("messages") { messages.forEach { add(it) } }
        }

    private fun serverMessage(id: String, at: Long, type: String = "system", editedAt: Long = at, metadata: JsonObject? = null) = buildJsonObject {
        put("id", id)
        put("type", type)
        put("content", "said $id")
        put("timestamp", at)
        put("editedAt", editedAt)
        metadata?.let { put("metadata", it) }
    }

    @Test
    fun `a conversation is sent once, then nothing more`() = runBlocking {
        val (thread, message) = asked("What is a half?")

        assertTrue(sync.sync())
        assertTrue(sync.sync())

        assertEquals(1, api.sent.size)
        val sent = api.sent.single().threads.single()
        assertEquals(thread.id, sent.id)
        assertEquals("topic", sent.scope["kind"]?.jsonPrimitive?.content)
        assertEquals(listOf(WireMessage(message.id, "user", "What is a half?", message.timestamp, message.timestamp)), sent.messages)
        assertTrue(dao.unsentThreads(ADA).isEmpty())
    }

    @Test
    fun `what is said while a send runs goes with the next`() = runBlocking {
        val (thread, _) = asked("First")
        api.meanwhile = { ada.add(thread.id, MessageKind.TUTOR, "Second") }

        assertTrue(sync.sync())

        assertEquals(2, api.sent.size)
        assertEquals(listOf("Second"), api.sent[1].threads.single().messages.map { it.content })
    }

    @Test
    fun `a conversation answered while a send runs is sent again with the tutor's memory`() = runBlocking {
        val (thread, _) = asked("First")
        api.meanwhile = { ada.recordTurn(thread, "context-1", "First") }

        assertTrue(sync.sync())

        assertEquals(listOf(null, "context-1"), api.sent.map { it.threads.single().agentContextId })
        assertTrue(dao.unsentThreads(ADA).isEmpty())
    }

    @Test
    fun `a conversation had offline stays until it can be sent`() = runBlocking {
        asked("Offline")
        api.reachable = false

        assertFalse(runCatching { sync.sentEverything() }.getOrDefault(false))
        assertEquals(1, dao.unsentThreads(ADA).size)
        api.reachable = true

        assertTrue(sync.sentEverything())
        assertEquals(1, api.sent.size)
    }

    @Test
    fun `another learner's conversations are neither sent nor counted`() = runBlocking {
        val bayo = ChatStore(dao, BAYO) { now++ }
        bayo.add(bayo.ensureThread(fractions).id, MessageKind.LEARNER, "Mine")

        assertTrue(sync.sentEverything())

        assertTrue(api.sent.isEmpty())
        assertEquals(1, dao.unsentThreads(BAYO).size)
    }

    @Test
    fun `another device's conversation is taken in with its history, a page at a time`() = runBlocking {
        val lesson = buildJsonObject {
            put("label", "Open lesson")
            putJsonObject("to") {
                put("type", "lesson")
                put("subjectSlug", "mathematics")
                put("topicIndex", 2)
            }
        }
        api.seq = 7
        api.pages += page(listOf(serverThread("t-web", listOf(serverMessage("m1", 10, "user")))), next = "7.m1")
        api.pages += page(listOf(serverThread("t-web", listOf(serverMessage("m2", 20, "complete", metadata = buildJsonObject { put("link", lesson) })))))

        assertTrue(sync.sync())

        assertEquals(listOf(Triple(0L, null, null), Triple(0L, 7L, "7.m1")), api.reads)
        val thread = ada.threads.first().single()
        assertEquals("t-web" to fractions, thread.id to thread.scope)
        val messages = ada.messagesNow("t-web")
        assertEquals(listOf(MessageKind.LEARNER, MessageKind.DONE), messages.map { it.kind })
        assertEquals(ChatLink("Open lesson", LinkTarget.Lesson("mathematics", 2)), messages[1].metadata.link)
        assertTrue(dao.unsentThreads(ADA).isEmpty())

        sync.sync()
        assertEquals(Triple(7L, null, null), api.reads.last())
    }

    @Test
    fun `another device's copy of a conversation joins this phone's`() = runBlocking {
        val (thread, _) = asked("Asked here")
        // The web's copy reached graspy first, then this phone's.
        api.seq = 1
        api.pages += page(listOf(serverThread("t-web", listOf(serverMessage("m-web", 1)), updatedAt = 1, context = "context-web", preview = "Asked on the web")), upTo = 2)

        sync.sync()

        val threads = ada.threads.first()
        assertEquals(listOf(thread.id), threads.map { it.id })
        assertEquals("context-web", threads.single().agentContextId)
        assertNull(threads.single().preview)
        assertEquals(listOf("said m-web", "Asked here"), ada.messagesNow(thread.id).map { it.content })
    }

    @Test
    fun `a conversation started here after another device's is that one`() = runBlocking {
        api.seq = 1
        api.pages += page(listOf(serverThread("t-web", listOf(serverMessage("m1", 1)))))
        sync.sync()

        assertEquals("t-web", ada.ensureThread(fractions).id)
    }

    @Test
    fun `a later edit from another device is taken, and an earlier one is not`() = runBlocking {
        val (thread, message) = asked("Card")
        sync.sync()
        fun edited(at: Long, followUp: String) = page(
            listOf(
                serverThread(
                    thread.id,
                    listOf(serverMessage(message.id, message.timestamp, "user", editedAt = at, metadata = buildJsonObject { putJsonArray("followUps") { add(followUp) } })),
                ),
            ),
        )

        api.pages += edited(message.timestamp - 1, "older")
        sync.sync()
        val kept = ada.messagesNow(thread.id).single()
        api.pages += edited(message.timestamp + 10, "newer")
        sync.sync()
        val taken = ada.messagesNow(thread.id).single()

        assertEquals(emptyList<String>(), kept.metadata.followUps)
        assertEquals(listOf("newer"), taken.metadata.followUps)
        assertEquals(message.timestamp + 10, dao.message(ADA, message.id)?.editedAt)
        assertTrue(dao.unsentThreads(ADA).isEmpty())
    }

    @Test
    fun `everything is read again when graspy's seq is behind what was read`() = runBlocking {
        ThreadCursor(preferences, ADA).keep(10)
        api.seq = 3

        sync.sync()

        assertEquals(listOf(10L, 0L), api.reads.map { it.first })
        assertEquals(3L, ThreadCursor(preferences, ADA).since())
    }

    @Test
    fun `reading runs on from the phone's own send when nothing was written between`() = runBlocking {
        ThreadCursor(preferences, ADA).keep(4)
        api.seq = 4
        asked("Mine")

        sync.sync()

        assertEquals(listOf(Triple(5L, null, null)), api.reads)
    }

    @Test
    fun `nothing is written once the phone learns as someone else`() = runBlocking {
        api.seq = 1
        api.pages += page(listOf(serverThread("t-web", listOf(serverMessage("m1", 1)))))
        api.meanwhile = { learning = false }

        sync.sync()

        assertTrue(ada.threads.first().isEmpty())
        assertEquals(0L, ThreadCursor(preferences, ADA).since())
    }

    @Test
    fun `a thread about something this app does not know is left out`() = runBlocking {
        val earlier = buildJsonObject {
            put("id", "earlier")
            putJsonObject("scope") { put("kind", "earlier") }
            put("createdAt", 1)
            put("updatedAt", 1)
            putJsonArray("messages") { add(serverMessage("m1", 1)) }
        }
        api.seq = 1
        api.pages += page(listOf(earlier, serverThread("t-web", listOf(serverMessage("m2", 2), serverMessage("m3", 3, "error")))))

        sync.sync()

        assertEquals(listOf("t-web"), ada.threads.first().map { it.id })
        assertEquals(listOf("m2"), ada.messagesNow("t-web").map { it.id })
    }

    @Test
    fun `a long conversation is split, each part under its thread`() {
        val thread = ChatThreadEntity(ADA, "t", "k", "{\"kind\":\"general\",\"planId\":\"p\"}", null, null, 1, 1)
        val long = (0 until 450).map { ChatMessageEntity(ADA, "m$it", "t", "user", "x", it.toLong(), "{}") }

        val batches = ThreadSync.batches(listOf(Unsent(thread, long)))

        assertEquals(listOf(200, 200, 50), batches.map { it.parts.single().messages.size })
        assertEquals(long, batches.flatMap { it.parts.single().messages })
    }

    @Test
    fun `at most fifty threads and a million characters go at once`() {
        fun thread(id: String) = ChatThreadEntity(ADA, id, id, "{\"kind\":\"general\",\"planId\":\"$id\"}", null, null, 1, 1)
        val many = (0 until 60).map { Unsent(thread("t$it"), emptyList()) }
        val large = listOf("a", "b").map { id -> Unsent(thread(id), listOf(ChatMessageEntity(ADA, "$id-m", id, "user", "y".repeat(600_000), 1, null))) }

        assertEquals(listOf(50, 10), ThreadSync.batches(many).map { it.parts.size })
        assertEquals(listOf(listOf("a"), listOf("b")), ThreadSync.batches(large).map { batch -> batch.parts.map { it.thread.id } })
    }

    @Test
    fun `the phone asks graspy as the web does`() = runBlocking {
        val web = MockWebServer()
        web.enqueue(MockResponse().setBody("{\"seq\":3}"))
        web.enqueue(MockResponse().setBody(page(emptyList(), upTo = 5, next = "5.m9").toString()))
        web.enqueue(MockResponse().setBody(page(emptyList(), upTo = 5).toString()))
        val calls: Call.Factory = OkHttpClient().let { client ->
            Call.Factory { request -> client.newCall(request.newBuilder().url(request.url.newBuilder().scheme("http").host(web.hostName).port(web.port).build()).build()) }
        }
        val http = ThreadSync(dao, ADA, retrofit(calls).create(ThreadsApi::class.java), ThreadCursor(preferences, ADA), { learning })
        asked("Over the wire")
        try {
            http.sync()

            val sent = web.takeRequest()
            assertEquals("POST" to "/api/learner/threads", sent.method to sent.requestUrl?.encodedPath)
            val body = apiJson.parseToJsonElement(sent.body.readUtf8()).jsonObject
            assertEquals(1, body.getValue("threads").jsonArray.size)
            assertEquals("/api/learner/threads?since=0", web.takeRequest().path)
            assertEquals("/api/learner/threads?since=0&upTo=5&after=5.m9", web.takeRequest().path)
        } finally {
            web.shutdown()
        }
    }

    private companion object {
        const val ADA = "uid-1/aaaaaaaaaaaa"
        const val BAYO = "uid-1/bbbbbbbbbbbb"
    }
}
