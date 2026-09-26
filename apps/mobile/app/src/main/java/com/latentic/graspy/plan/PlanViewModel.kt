package com.latentic.graspy.plan

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.BuildConfig
import com.latentic.graspy.account.PreferenceFiles
import com.latentic.graspy.ask.PlanChanges
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.retrofit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrl

sealed interface PlanState {
    data object Loading : PlanState

    /** The learner has no plan on any device yet. */
    data object None : PlanState

    data object Failed : PlanState

    data class Ready(val plan: LearnerPlan, val record: LearnerRecord) : PlanState {
        val marks = TopicMarks(record)
    }
}

/** A plan being made: as far as it has come, and why it stopped if it did. */
data class Making(val plan: LearnerPlan?, val failed: Boolean = false)

/**
 * The learner's shared plan and their record on it, as the web keeps them: read from the account, kept on
 * the phone for when there is no connection, and changed here the way the web changes it.
 */
class PlanViewModel(application: Application, ownerId: String) : AndroidViewModel(application), PlanChanges {
    private val calls = AppGraph.callsFor(application, ownerId)
    private val api = retrofit(calls).create(PlanApi::class.java)
    private val maker = PlanMaker(PlanStreams(calls, BuildConfig.API_BASE_URL.toHttpUrl())::curriculum)
    private val kept = KeptPlan(application.getSharedPreferences(PreferenceFiles.PLAN, 0), ownerId) { AppGraph.account(application).learnsAs(ownerId) }
    private val shown = MutableStateFlow<PlanState>(kept.read() ?: PlanState.Loading)
    private val making = MutableStateFlow<Making?>(null)
    private var makingJob: Job? = null
    private var lastOrder: (suspend () -> LearnerPlan)? = null

    val state: StateFlow<PlanState> = shown.asStateFlow()

    val makingState: StateFlow<Making?> = making.asStateFlow()

    init {
        refresh()
    }

    /** What is shown stays while the newer copy is read. */
    fun refresh(): Job = viewModelScope.launch {
        val read = runCatchingPlan { api.plan().plan?.let(LearnerPlan::of) }
        shown.value = if (read.isFailure) {
            shown.value.takeIf { it is PlanState.Ready } ?: PlanState.Failed
        } else {
            read.getOrNull()?.let { ready(it) } ?: PlanState.None
        }
        keep(shown.value)
    }

    override val plan: LearnerPlan? get() = (shown.value as? PlanState.Ready)?.plan

    /** Shown at once and sent; the server keeps the newer plan and answers with it. */
    override suspend fun apply(next: LearnerPlan): LearnerPlan {
        val stamped = next.copy(updatedAt = System.currentTimeMillis())
        val record = (shown.value as? PlanState.Ready)?.takeIf { it.plan.planId == stamped.planId }?.record ?: LearnerRecord()
        shown.value = PlanState.Ready(stamped, record)
        val answered = api.keep(stamped.toJson()).plan?.let(LearnerPlan::of) ?: stamped
        shown.value = ready(answered, record)
        keep(shown.value)
        return answered
    }

    /** A new plan for the learner's details and chosen subjects, replacing any they had, kept on the account. */
    suspend fun make(details: LearnerDetails, subjects: List<String>): LearnerPlan = apply(maker.make(details, subjects))

    /** New topics for every chosen subject, the learner's paths carried over, their progress cleared. */
    override fun rebuild(): Boolean {
        val previous = (shown.value as? PlanState.Ready)?.plan ?: return false
        val subjects = previous.rebuildSubjects().ifEmpty { return false }
        start { carryPaths(previous, maker.make(previous.details(), subjects, ::showMaking)) }
        return true
    }

    fun retryMaking() {
        lastOrder?.let(::start)
    }

    /** The subjects named; new ones get topics, dropped ones lose their record on the server. */
    override suspend fun changeSubjects(names: List<String>) {
        val plan = requireReady().plan
        val change = subjectChange(plan.subjects, names)
        val (added, topics) = if (change.added.isEmpty()) emptyList<PlanSubject>() to emptyMap() else maker.topicsFor(plan.details(), change.kept, change.added)
        change.removed.forEach { subject ->
            recordChange("subject_dropped") {
                put("planId", plan.planId)
                put("subjectSlug", subject.slug)
            }
        }
        apply(plan.withSubjects(change.kept, added, topics, System.currentTimeMillis()))
    }

    override suspend fun planPath(goal: String): LearningPath {
        val plan = requireReady().plan
        return api.path(plan.country, plan.language, goal, plan.gradeLevel.ifBlank { null })
    }

    fun requireReady(): PlanState.Ready = shown.value as? PlanState.Ready ?: error("There is no plan to change")

    private fun start(order: suspend () -> LearnerPlan) {
        lastOrder = order
        makingJob?.cancel()
        making.value = Making(null)
        makingJob = viewModelScope.launch {
            try {
                apply(order())
                making.value = null
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "The plan was not made", error)
                making.value = making.value?.copy(failed = true) ?: Making(null, failed = true)
            }
        }
    }

    private fun showMaking(plan: LearnerPlan) {
        making.value = Making(plan)
    }

    private suspend fun carryPaths(previous: LearnerPlan, rebuilt: LearnerPlan): LearnerPlan {
        val carried = previous.paths().filter { path -> rebuilt.subjects.none { it.name == path.name } }
        recordChange("subjects_carried") {
            put("fromPlan", previous.planId)
            put("toPlan", rebuilt.planId)
            put("subjectSlugs", JsonArray(carried.map { JsonPrimitive(it.slug) }))
        }
        recordChange("plan_kept") { put("planId", rebuilt.planId) }
        return rebuilt.withPathsFrom(previous, System.currentTimeMillis())
    }

    // A record failure leaves stale topics there; the change to the plan still stands.
    private suspend fun recordChange(kind: String, fields: JsonObjectBuilder.() -> Unit) {
        runCatchingPlan { api.changeRecord(buildJsonObject { put("kind", kind); fields() }) }
            .onFailure { Log.w(TAG, "The record did not take the change $kind", it) }
    }

    private suspend fun ready(plan: LearnerPlan, known: LearnerRecord? = null): PlanState.Ready {
        val record = runCatchingPlan { api.record(plan.planId) }.getOrNull() ?: known ?: LearnerRecord()
        return PlanState.Ready(plan, record)
    }

    private fun keep(state: PlanState) {
        (state as? PlanState.Ready)?.let(kept::keep)
    }

    private suspend fun <T> runCatchingPlan(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        Log.w(TAG, "A plan call failed", error)
        Result.failure(error)
    }

    private companion object {
        const val TAG = "GraspyPlan"
    }
}
