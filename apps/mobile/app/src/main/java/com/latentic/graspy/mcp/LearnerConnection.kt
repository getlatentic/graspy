package com.latentic.graspy.mcp

import androidx.room.withTransaction
import com.latentic.graspy.collection.outbox.GraspyDatabase
import com.latentic.graspy.lesson.LessonServer
import com.latentic.graspy.lesson.OfflineLessons
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonObject
import okhttp3.Call
import okhttp3.HttpUrl

/**
 * One learner's MCP connection and what it keeps on the phone to work without one: the view calls the server
 * has yet to take, the views, and the lessons, each under [ownerId] where it is the learner's own.
 */
class LearnerConnection(
    database: GraspyDatabase,
    val ownerId: String,
    calls: Call.Factory,
    endpoint: HttpUrl,
    keeper: SandboxKeeper,
    stillLearning: () -> Boolean,
) : ViewServer {
    private val mcp = McpClient(calls, endpoint)
    private val outbox = McpOutbox(database.keptCallDao(), ownerId, mcp::callTool, stillLearning, { keep -> database.withTransaction { keep() } })
    private val views = OfflineViews(database.keptViewDao(), mcp::view, keeper)

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

    /** Tells each time a view call is kept. */
    val kept: Flow<Unit> = outbox.kept

    /** Sends the kept view calls; false while some are still on the phone. */
    suspend fun sentEverything(): Boolean = outbox.sentEverything()

    override suspend fun view(uri: String): UiView = views.view(uri)

    override suspend fun call(name: String, arguments: JsonObject): JsonObject = outbox.callOrKeep(name, arguments)

    /** A call that only reads: never kept to send later, so without a connection it fails. */
    suspend fun read(name: String, arguments: JsonObject): JsonObject = mcp.callTool(name, arguments)

    override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = mcp.openToolView(name, arguments)
}
