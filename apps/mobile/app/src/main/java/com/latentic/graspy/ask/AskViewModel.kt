package com.latentic.graspy.ask

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.withTransaction
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.localization.ChatCopy
import com.latentic.graspy.mcp.API_ORIGIN
import com.latentic.graspy.mcp.bestEffort
import com.latentic.graspy.sync.Resending
import com.latentic.graspy.sync.appStarted
import com.latentic.graspy.sync.networkReach
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrl

/** What one turn needs beyond its words: the learner's situation, their plan, and the app's words for its notes. */
class TurnContext(val learner: JsonObject, val plan: PlanChanges, val words: ChatCopy)

/** The tutor's side of the open conversation while it answers, and the change it waits on. */
data class TurnState(
    val busyThreadId: String? = null,
    /** What the tutor has written so far of the answer it is writing. */
    val streaming: String = "",
    /** The tool the tutor is working, while it works one. */
    val activity: String? = null,
    val pending: PendingChange? = null,
    val pendingThreadId: String? = null,
    val changingPlan: Boolean = false,
    /** Set when a confirmed rebuild replaced the plan; Home shows it being made. */
    val rebuilt: Long? = null,
)

/**
 * The learner's conversations with the tutor, kept per topic as the web keeps them: a thread for each topic,
 * subject or general question, its messages on the phone and on the learner's other devices, the tutor's memory
 * of it on the server. What a view did waits, deduplicated, for the next message, which carries it to the tutor.
 * The conversations are synced while there is a connection, after each message kept, and when Ask is shown.
 */
class AskViewModel(application: Application, private val ownerId: String) : AndroidViewModel(application) {
    private val tutor = TutorClient(AppGraph.callsFor(application, ownerId), "$API_ORIGIN/a2a".toHttpUrl())
    private val database = AppGraph.database(application)
    private val store = ChatStore(database.chatDao(), ownerId, { block -> database.withTransaction { block() } })
    private val threadSync = threadSyncFor(application, ownerId)
    private val openScope = MutableStateFlow<ThreadScope?>(null)
    private val failures = MutableStateFlow<List<ChatMessage>>(emptyList())
    private val turn = MutableStateFlow(TurnState())
    private val unreadState = MutableStateFlow(Unread())
    private val ids = AtomicLong()
    private var viewCalls = emptyList<JsonObject>()
    private var running: Job? = null

    /** Null until read from the phone. */
    val threads: StateFlow<List<ChatThread>?> = store.threads.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val turnState: StateFlow<TurnState> = turn.asStateFlow()

    init {
        viewModelScope.launch { Resending("the conversations", threadSync::sync, store.kept).whileSeen(networkReach(application), appStarted()) }
    }

    /** Takes in what the learner said on their other devices since the phone last read. */
    fun refresh() {
        viewModelScope.launch { bestEffort(TAG, "Reading the conversations") { threadSync.sync() } }
    }

    val unread: StateFlow<Unread> = unreadState.asStateFlow()

    /** The thread on screen, or null when no conversation is. */
    fun viewing(threadId: String?) = unreadState.update { it.lookingAt(threadId) }

    /** The open conversation's messages, those kept and failures shown only now. */
    @OptIn(ExperimentalCoroutinesApi::class)
    val messages: StateFlow<Pair<String?, List<ChatMessage>>> = combine(openScope, threads) { scope, all ->
        scope?.let { open -> all.orEmpty().firstOrNull { it.scope.key == open.key }?.id }
    }.flatMapLatest { threadId ->
        if (threadId == null) flowOf(null to emptyList()) else combine(store.messages(threadId), failures) { kept, failed ->
            threadId to (kept + failed.filter { it.threadId == threadId }).sortedBy { it.timestamp }
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null to emptyList())

    fun open(scope: ThreadScope) {
        openScope.value = scope
    }

    val busy: Boolean get() = turn.value.busyThreadId != null

    /** False while another turn runs, as the web refuses a view's message then. */
    fun send(text: String, scope: ThreadScope, context: TurnContext): Boolean {
        val words = text.trim().take(TutorClient.MAX_MESSAGE)
        if (words.isEmpty() || busy) return false
        val calls = viewCalls.also { viewCalls = emptyList() }
        turn.update { it.copy(busyThreadId = PENDING, streaming = "", activity = null) }
        running = viewModelScope.launch { runTurn(words, scope, calls, context) }
        return true
    }

    fun stop() {
        running?.cancel()
    }

    fun viewCalled(name: String, arguments: JsonObject) {
        val call = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", ids.incrementAndGet())
            put("method", "tools/call")
            put("params", buildJsonObject {
                put("name", name)
                put("arguments", arguments)
            })
        }
        if (viewCalls.none { it["params"] == call["params"] }) viewCalls = viewCalls + call
    }

    fun confirmPlanChange(context: TurnContext) {
        val state = turn.value
        val change = state.pending ?: return
        if (change is PendingChange.Path && change.path == null) return
        turn.update { it.copy(pending = null) }
        viewModelScope.launch { actionsFor(context, state.pendingThreadId).confirm(change) }
    }

    fun dismissPlanChange() {
        turn.update { it.copy(pending = null, pendingThreadId = null) }
    }

    private suspend fun runTurn(text: String, scope: ThreadScope, calls: List<JsonObject>, context: TurnContext) {
        val thread = store.ensureThread(scope)
        turn.update { it.copy(busyThreadId = thread.id) }
        try {
            val unanswered = unansweredIn(store.messagesNow(thread.id))
            store.add(thread.id, MessageKind.LEARNER, text, MessageMetadata(appCalls = calls))
            val reply = tutor.ask(TutorTurn(text, thread.agentContextId, context.learner, calls, unanswered), streamInto())
            store.recordTurn(thread, reply.contextId, text)
            store.add(thread.id, MessageKind.TUTOR, reply.text, MessageMetadata(followUps = reply.followUps, card = reply.cards.firstOrNull()))
            turn.update { it.copy(streaming = "", activity = null) }
            reply.actions.forEach { actionsFor(context, thread.id).carryOut(it) }
        } catch (stopped: CancellationException) {
            withContext(NonCancellable) { keepWhatStreamed(thread.id) }
            throw stopped
        } catch (failure: Exception) {
            Log.w(TAG, "The tutor did not answer", failure)
            keepWhatStreamed(thread.id)
            val retryable = (failure as? TutorUnreachable)?.retryable == true
            failed(thread.id, if (retryable) context.words.temporaryProblem else context.words.tutorError)
        } finally {
            turn.update { it.copy(busyThreadId = null, streaming = "", activity = null) }
            unreadState.update { it.answered(thread.id) }
        }
    }

    /** What streamed before a stop or a failure stays, marked as stopped. */
    private suspend fun keepWhatStreamed(threadId: String) {
        val streamed = turn.value.streaming.trim()
        if (streamed.isNotEmpty()) store.add(threadId, MessageKind.TUTOR, streamed, MessageMetadata(stopped = true))
    }

    private suspend fun failed(threadId: String, text: String) {
        val message = store.add(threadId, MessageKind.FAILED, text)
        failures.update { it + message }
    }

    private fun actionsFor(context: TurnContext, threadId: String?) = PlanActions(
        context.plan,
        context.words,
        object : ActionReports {
            override suspend fun done(text: String, link: ChatLink?) {
                threadId?.let { store.add(it, MessageKind.DONE, text, MessageMetadata(link = link)) }
            }

            override suspend fun failed(text: String) {
                threadId?.let { failed(it, text) }
            }

            override fun pending(change: PendingChange?) = turn.update { it.copy(pending = change, pendingThreadId = threadId) }

            override fun changing(busy: Boolean) = turn.update { it.copy(changingPlan = busy) }

            override fun rebuilt() = turn.update { it.copy(rebuilt = System.currentTimeMillis()) }
        },
    )

    private fun streamInto() = object : TurnListener {
        override fun onDelta(text: String) = turn.update { it.copy(streaming = it.streaming + text, activity = null) }

        override fun onRestart() = turn.update { it.copy(streaming = "") }

        override fun onActivity(tool: String) = turn.update { it.copy(activity = tool) }
    }

    private companion object {
        const val TAG = "GraspyTutor"
        // Busy before the thread is known, so a second tap in the same moment is refused.
        const val PENDING = "pending"
    }
}
