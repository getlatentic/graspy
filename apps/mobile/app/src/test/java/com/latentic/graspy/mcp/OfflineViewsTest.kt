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

/** A view shown once opens again with no connection, from the page it last loaded in the sandbox. */
@RunWith(RobolectricTestRunner::class)
class OfflineViewsTest {
    private val dao = FakeDao()
    private var reachable = true
    private var refusal: Exception? = null
    private var page = LESSON_PAGE
    private val lesson = UiView(
        html = LESSON_PAGE,
        title = "Lesson",
        csp = buildJsonObject { put("resourceDomains", buildJsonArray { add(JsonPrimitive("https://fonts.example")) }) },
        permissions = null,
    )
    private val views = OfflineViews(dao) { uri ->
        if (!reachable) throw IOException("no connection")
        refusal?.let { throw it }
        if (uri != LESSON) throw McpRefusal("$uri is not an MCP App view")
        lesson.copy(html = page)
    }

    @Test
    fun `offline, a view shown before opens from its page`() = runBlocking {
        views.keepShown(LESSON, views.view(LESSON))

        reachable = false
        assertEquals(lesson, views.view(LESSON))
    }

    @Test
    fun `a refusal is the server's answer, never stood in for by the kept page`() {
        runBlocking { views.keepShown(LESSON, views.view(LESSON)) }

        refusal = McpRefusal("resources/read failed: HTTP 500")
        assertThrows(McpRefusal::class.java) { runBlocking { views.view(LESSON) } }
        refusal = SessionRefusal("graspy did not issue a session")
        assertThrows(SessionRefusal::class.java) { runBlocking { views.view(LESSON) } }
    }

    @Test
    fun `reading a view keeps nothing, and only a page loaded in the sandbox replaces the kept one`() = runBlocking {
        views.keepAll(listOf(LESSON))
        page = DEPLOYED_PAGE

        val deployed = views.view(LESSON)
        reachable = false
        assertEquals(LESSON_PAGE, views.view(LESSON).html)

        views.keepShown(LESSON, deployed)
        assertEquals(DEPLOYED_PAGE, views.view(LESSON).html)
    }

    @Test
    fun `a background run keeps a view with no page, and never replaces one kept by showing`() = runBlocking {
        views.keepAll(listOf(LESSON))
        views.keepShown(LESSON, views.view(LESSON))
        page = DEPLOYED_PAGE

        views.keepAll(listOf(LESSON))

        reachable = false
        assertEquals(LESSON_PAGE, views.view(LESSON).html)
    }

    @Test
    fun `a view never kept has no page to open`() {
        runBlocking { views.view(LESSON) }

        reachable = false
        assertThrows(IOException::class.java) { runBlocking { views.view(LESSON) } }
    }

    @Test
    fun `a page is kept once a run, however often it is shown, and a newer page shown is kept too`() = runBlocking {
        repeat(3) { views.keepShown(LESSON, lesson) }
        assertEquals(1, dao.writes)

        views.keepShown(LESSON, lesson.copy(html = DEPLOYED_PAGE))
        assertEquals(2, dao.writes)
    }

    @Test
    fun `a page that cannot be saved never fails the view, and is saved when it can be`() = runBlocking {
        dao.full = true
        views.keepShown(LESSON, lesson)

        dao.full = false
        views.keepShown(LESSON, lesson)
        reachable = false
        assertEquals(lesson, views.view(LESSON))
    }

    @Test
    fun `keeping every view reads and keeps each, one failing stopping none`() = runBlocking {
        views.keepAll(listOf("ui://graspy/refused", LESSON))

        reachable = false
        assertEquals(lesson, views.view(LESSON))
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

        override suspend fun keepIfNone(view: KeptViewEntity) {
            rows.putIfAbsent(view.uri, view)
        }

        override suspend fun kept(uri: String) = rows[uri]
    }

    private companion object {
        const val LESSON = "ui://graspy/lesson"
        const val LESSON_PAGE = "<!doctype html><script src=\"/views/assets/lesson-a1.js\"></script>"
        const val DEPLOYED_PAGE = "<!doctype html><script src=\"/views/assets/lesson-b2.js\"></script>"
    }
}
