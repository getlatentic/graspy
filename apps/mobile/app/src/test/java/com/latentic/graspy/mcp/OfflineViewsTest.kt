package com.latentic.graspy.mcp

import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/** A view read once opens again with no connection, from the document last read. */
class OfflineViewsTest {
    private val dao = FakeDao()
    private var reachable = true
    private val lesson = UiView(
        html = "<!doctype html><script src=\"/views/assets/lesson.js\"></script>",
        title = "Lesson",
        csp = buildJsonObject { put("resourceDomains", buildJsonArray { add(JsonPrimitive("https://fonts.example")) }) },
        permissions = null,
    )
    private val views = OfflineViews(dao) { uri ->
        if (!reachable) throw IOException("no connection")
        if (uri != LESSON) throw McpRefusal("$uri is not an MCP App view")
        lesson
    }

    @Test
    fun `offline, a view read before opens from its copy`() = runBlocking {
        views.view(LESSON)

        reachable = false
        assertEquals(lesson, views.view(LESSON))
    }

    @Test
    fun `a view never read has no copy to open`() {
        reachable = false
        assertThrows(IOException::class.java) { runBlocking { views.view(LESSON) } }
    }

    @Test
    fun `a view is kept once a run, however often it opens`() = runBlocking {
        repeat(3) { views.view(LESSON) }

        assertEquals(1, dao.writes)
    }

    private class FakeDao : KeptViewDao {
        private val rows = mutableMapOf<String, KeptViewEntity>()
        var writes = 0

        override suspend fun keep(view: KeptViewEntity) {
            rows[view.uri] = view
            writes += 1
        }

        override suspend fun kept(uri: String) = rows[uri]
    }

    private companion object {
        const val LESSON = "ui://graspy/lesson"
    }
}
