package com.latentic.graspy.mcp

import android.database.sqlite.SQLiteFullException
import com.latentic.graspy.account.SessionRefusal
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A view kept while online opens with no connection, from its page, once the sandbox of its build holds every
 * file of that build: before a deploy, after one, and on a phone that never showed it.
 */
@RunWith(RobolectricTestRunner::class)
class OfflineViewsTest {
    private val dao = FakeDao()
    private var reachable = true
    private var refusal: Exception? = null
    private var page = LESSON_PAGE
    private var sandbox = BUILD_A
    private val holding = mutableSetOf(BUILD_A, BUILD_B)
    private val asked = mutableListOf<Pair<String, Set<String>>>()
    private val lesson = UiView(
        html = LESSON_PAGE,
        title = "Lesson",
        sandbox = BUILD_A,
        csp = buildJsonObject { put("resourceDomains", buildJsonArray { add(JsonPrimitive("https://api.example")) }) },
        permissions = null,
    )
    private val keeper = SandboxKeeper { sandbox, needed ->
        asked += sandbox to needed
        sandbox in holding
    }
    private var views = offlineViews()

    private fun offlineViews() = OfflineViews(
        dao,
        { uri ->
            if (!reachable) throw IOException("no connection")
            refusal?.let { throw it }
            if (uri != LESSON) throw McpRefusal("$uri is not an MCP App view")
            lesson.copy(html = page, sandbox = sandbox)
        },
        keeper,
    )

    /** The app starts again: nothing of the last run is remembered but what it kept. */
    private fun restarted() {
        views = offlineViews()
    }

    private fun offline(): UiView {
        reachable = false
        return runBlocking { views.view(LESSON) }
    }

    @Test
    fun `a view never shown opens offline once its sandbox holds its build's files`() = runBlocking {
        views.keepAll(listOf(LESSON))

        assertEquals(listOf(BUILD_A to setOf(BUILD_A)), asked)
        assertEquals(lesson, offline())
    }

    @Test
    fun `a view is not kept while its sandbox does not hold every file`() {
        holding.clear()
        runBlocking { views.keepAll(listOf(LESSON)) }

        assertThrows(IOException::class.java) { offline() }
    }

    @Test
    fun `after a deploy, the page kept before stays until the new build's files are held`() = runBlocking {
        views.keepAll(listOf(LESSON))
        restarted()
        page = DEPLOYED_PAGE
        sandbox = BUILD_B
        holding -= BUILD_B

        views.keepAll(listOf(LESSON))

        assertEquals(BUILD_B to setOf(BUILD_A, BUILD_B), asked.last())
        assertEquals(lesson, offline())
    }

    @Test
    fun `after a deploy, the new page replaces the kept one once its files are held, and the old sandbox goes next`() = runBlocking {
        views.keepAll(listOf(LESSON))
        restarted()
        page = DEPLOYED_PAGE
        sandbox = BUILD_B

        views.keepAll(listOf(LESSON))
        assertEquals(BUILD_B to setOf(BUILD_A, BUILD_B), asked.last())
        restarted()
        views.keepAll(listOf(LESSON))
        assertEquals(BUILD_B to setOf(BUILD_B), asked.last())

        assertEquals(lesson.copy(html = DEPLOYED_PAGE, sandbox = BUILD_B), offline())
    }

    @Test
    fun `a sandbox is kept once a run`() = runBlocking {
        repeat(3) { views.keepAll(listOf(LESSON)) }

        assertEquals(1, asked.size)
        assertEquals(1, dao.writes)
    }

    @Test
    fun `a sandbox that could not be kept is asked again in the same run`() = runBlocking {
        holding.clear()
        views.keepAll(listOf(LESSON))
        holding += BUILD_A

        views.keepAll(listOf(LESSON))

        assertEquals(2, asked.size)
        assertEquals(lesson, offline())
    }

    @Test
    fun `a page kept before pages named their sandbox is not opened`() {
        runBlocking { dao.keep(KeptViewEntity(LESSON, LESSON_PAGE, "Lesson", null, null, sandbox = null)) }

        assertThrows(IOException::class.java) { offline() }
    }

    @Test
    fun `a refusal is the server's answer, never stood in for by the kept page`() {
        runBlocking { views.keepAll(listOf(LESSON)) }

        refusal = McpRefusal("resources/read failed: HTTP 500")
        assertThrows(McpRefusal::class.java) { runBlocking { views.view(LESSON) } }
        refusal = SessionRefusal("graspy did not issue a session")
        assertThrows(SessionRefusal::class.java) { runBlocking { views.view(LESSON) } }
    }

    @Test
    fun `reading a view keeps nothing`() {
        runBlocking { views.view(LESSON) }

        assertThrows(IOException::class.java) { offline() }
    }

    @Test
    fun `a page that cannot be saved never fails the keep, and is saved when it can be`() = runBlocking {
        dao.full = true
        views.keepAll(listOf(LESSON))

        dao.full = false
        views.keepAll(listOf(LESSON))
        assertEquals(lesson, offline())
    }

    @Test
    fun `keeping every view reads and keeps each, one failing stopping none`() = runBlocking {
        views.keepAll(listOf("ui://graspy/refused", LESSON))

        assertEquals(lesson, offline())
    }

    private class FakeDao : KeptViewDao {
        private val rows = mutableMapOf<String, KeptViewEntity>()
        var writes = 0
        var full = false

        override suspend fun keep(view: KeptViewEntity) {
            if (full) throw SQLiteFullException("database or disk is full")
            rows[view.uri] = view
            writes += 1
        }

        override suspend fun kept(uri: String) = rows[uri]

        override suspend fun sandboxes() = rows.values.mapNotNull { it.sandbox }.distinct()
    }

    private companion object {
        const val LESSON = "ui://graspy/lesson"
        const val BUILD_A = "/ui-sandbox/0123456789abcdef/"
        const val BUILD_B = "/ui-sandbox/fedcba9876543210/"
        const val LESSON_PAGE = "<!doctype html><script src=\"/views/assets/lesson-a1.js\"></script>"
        const val DEPLOYED_PAGE = "<!doctype html><script src=\"/views/assets/lesson-b2.js\"></script>"
    }
}
