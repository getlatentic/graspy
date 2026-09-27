package com.latentic.graspy.mcp

import android.app.Application
import com.latentic.graspy.account.PreferenceFiles
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.account.Outbox
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.lesson.OfflineLessons
import com.latentic.graspy.plan.RecordRead
import com.latentic.graspy.sync.appStarted
import com.latentic.graspy.sync.networkReach
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl

/**
 * The learner's MCP connection, kept while they learn here so the server's catalogue is read once. The
 * view calls the server has yet to take are sent while the app is started with a connection, and tried again
 * a few times while any stay on the phone ([KeptCallResending]); the plan's ready lessons are copied here each
 * time the server gives the learner's record.
 */
class LearnerViews internal constructor(
    application: Application,
    private val connection: LearnerConnection,
) : AndroidViewModel(application), ViewServer {
    constructor(application: Application, ownerId: String) : this(application, connectionFor(application, ownerId))

    val lessons: OfflineLessons = connection.lessons

    val routes = LearnerRoutes(connection::read, application.getSharedPreferences(PreferenceFiles.PLAN, 0), connection.ownerId)

    init {
        viewModelScope.launch { KeptCallResending(connection::sentEverything, connection.kept).whileSeen(networkReach(application), appStarted()) }
        viewModelScope.launch { lessons.copyWhenAsked() }
    }

    fun copyReadyLessons(read: RecordRead) = lessons.copyReady(read)

    override suspend fun view(uri: String): UiView = connection.view(uri)

    override suspend fun keepShown(uri: String, view: UiView) = connection.keepShown(uri, view)

    override suspend fun call(name: String, arguments: JsonObject): JsonObject = connection.call(name, arguments)

    override suspend fun openToolView(name: String, arguments: JsonObject): ViewCard = connection.openToolView(name, arguments)
}

/** A learner's kept view calls, sent before the device leaves them: whether none is left on the phone. */
fun keptViewCalls(application: Application): Outbox = Outbox { learnerKey -> connectionFor(application, learnerKey).sentEverything() }

private fun connectionFor(application: Application, ownerId: String) = LearnerConnection(
    database = AppGraph.database(application),
    ownerId = ownerId,
    calls = AppGraph.callsFor(application, ownerId),
    endpoint = "$API_ORIGIN/mcp".toHttpUrl(),
    stillLearning = { AppGraph.account(application).learnsAs(ownerId) },
)
