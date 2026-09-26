package com.latentic.graspy.mcp

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.lesson.LessonServer
import com.latentic.graspy.lesson.OfflineLessons
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.sync.networkReach
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl

/**
 * The learner's MCP connection, kept while they learn here so the server's catalogue is read once; the
 * view calls kept while there was no connection, sent whenever there is one; and the views and lessons
 * copied to the phone to open without one.
 */
class LearnerViews(application: Application) : AndroidViewModel(application), ViewServer {
    private val ownerId = requireNotNull(AppGraph.account(application).learnerInUse())
    private val database = AppGraph.database(application)
    private val mcp = McpClient(AppGraph.callsFor(application, ownerId), "$API_ORIGIN/mcp".toHttpUrl())
    private val outbox = McpOutbox(database.keptCallDao(), ownerId, mcp::callTool)
    private val views = OfflineViews(database.keptViewDao(), mcp::view)

    val lessons = OfflineLessons(
        database.lessonCopyDao(),
        ownerId,
        object : LessonServer {
            override suspend fun openToolView(name: String, arguments: JsonObject) = mcp.openToolView(name, arguments)

            override suspend fun callTool(name: String, arguments: JsonObject) = mcp.callTool(name, arguments)
        },
    )

    init {
        viewModelScope.launch { networkReach(application).filter { it }.collect { runCatching { outbox.sendKept() } } }
    }

    /** Called with each record the server gives, so the plan's ready lessons are on the phone. */
    fun copyReadyLessons(read: PlanState.Ready) {
        viewModelScope.launch {
            try {
                lessons.copyReady(read.plan, read.record)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Log.w(TAG, "Keeping lessons for offline failed", failure)
            }
        }
    }

    override suspend fun view(uri: String): UiView = views.view(uri)

    override suspend fun call(name: String, arguments: JsonObject): JsonObject = outbox.callOrKeep(name, arguments)

    override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = mcp.openToolView(name, arguments)

    private companion object {
        const val TAG = "GraspyViews"
    }
}
