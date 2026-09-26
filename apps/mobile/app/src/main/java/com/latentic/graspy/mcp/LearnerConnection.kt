package com.latentic.graspy.mcp

import androidx.room.withTransaction
import com.latentic.graspy.collection.outbox.GraspyDatabase
import com.latentic.graspy.lesson.LessonServer
import com.latentic.graspy.lesson.OfflineLessons
import kotlinx.serialization.json.JsonObject
import okhttp3.Call
import okhttp3.HttpUrl

/**
 * One learner's MCP connection and what it keeps on the phone to work without one: the view calls made
 * offline, the views, and the lessons, each under [ownerId] where it is the learner's own.
 */
class LearnerConnection(
    database: GraspyDatabase,
    ownerId: String,
    calls: Call.Factory,
    endpoint: HttpUrl,
    stillLearning: () -> Boolean,
) : ViewServer {
    private val mcp = McpClient(calls, endpoint)
    private val outbox = McpOutbox(database.keptCallDao(), ownerId, mcp::callTool)
    private val views = OfflineViews(database.keptViewDao(), mcp::view)

    val lessons = OfflineLessons(
        database.lessonCopyDao(),
        ownerId,
        object : LessonServer {
            override suspend fun openToolView(name: String, arguments: JsonObject) = mcp.openToolView(name, arguments)

            override suspend fun callTool(name: String, arguments: JsonObject) = mcp.callTool(name, arguments)

            override suspend fun viewOf(name: String) = mcp.viewOf(name)

            override suspend fun keepViews() = views.keepAll(mcp.viewUris())
        },
        stillLearning,
        { keep -> database.withTransaction { keep() } },
    )

    suspend fun sendKept(): Int = outbox.sendKept()

    override suspend fun view(uri: String): UiView = views.view(uri)

    override suspend fun call(name: String, arguments: JsonObject): JsonObject = outbox.callOrKeep(name, arguments)

    override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = mcp.openToolView(name, arguments)
}
