package com.latentic.graspy.lesson

import com.latentic.graspy.mcp.UiView
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.ViewServer
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A lesson's view asks its lesson tools through the phone's copy, and anything else as any view does. */
@RunWith(RobolectricTestRunner::class)
class LessonViewServerTest {
    private val server = FakeLessonServer()
    private val lessons = OfflineLessons(FakeLessonCopies(), "uid/ada", server, { true }) { 1L }
    private val views = RecordingViews()
    private val fractions = topic(1)

    @Test
    fun `offline, the view's lesson calls are answered from the copy`() = runBlocking {
        server.gives = lessonCard("ready")
        val card = lessons.openOrCopy(fractions)
        server.reachable = false
        val lessonView = LessonViewServer(views, lessons, fractions, card)

        assertEquals(card.toolResult, lessonView.call("lesson_progress", JsonObject(emptyMap())))
        assertEquals(card.toolResult, lessonView.call("give_lesson", JsonObject(emptyMap())))
        assertEquals(emptyList<String>(), views.called)
    }

    @Test
    fun `the view's other calls go as any view's, kept for later offline`() = runBlocking {
        val lessonView = LessonViewServer(views, lessons, fractions, lessonCard("ready"))

        assertEquals(RecordingViews.KEPT, lessonView.call("finish_lesson", JsonObject(emptyMap())))
        assertEquals(listOf("finish_lesson"), views.called)
    }

    private class RecordingViews : ViewServer {
        val called = mutableListOf<String>()

        override suspend fun view(uri: String): UiView = error("not read here")

        override suspend fun keepShown(uri: String, view: UiView) = error("not kept here")

        override suspend fun call(name: String, arguments: JsonObject): JsonObject = KEPT.also { called += name }

        override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = error("not opened here")

        companion object {
            val KEPT = buildJsonObject { put("kept", true) }
        }
    }
}
