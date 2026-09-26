package com.latentic.graspy.mcp

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.sync.networkReach
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl

/**
 * The learner's MCP connection, kept while they learn here so the server's catalogue is read once, and the
 * view calls kept while there was no connection, sent whenever there is one.
 */
class LearnerViews(application: Application) : AndroidViewModel(application), ViewServer {
    private val ownerId = requireNotNull(AppGraph.account(application).learnerInUse())
    private val mcp = McpClient(AppGraph.callsFor(application, ownerId), "$API_ORIGIN/mcp".toHttpUrl())
    private val outbox = McpOutbox(AppGraph.database(application).keptCallDao(), ownerId, mcp::callTool)

    init {
        viewModelScope.launch { networkReach(application).filter { it }.collect { runCatching { outbox.sendKept() } } }
    }

    override suspend fun view(uri: String): UiView = mcp.view(uri)

    override suspend fun call(name: String, arguments: JsonObject): JsonObject = outbox.callOrKeep(name, arguments)

    override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = mcp.openToolView(name, arguments)
}
