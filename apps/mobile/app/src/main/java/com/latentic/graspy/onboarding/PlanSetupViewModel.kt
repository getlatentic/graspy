package com.latentic.graspy.onboarding

import android.app.Application
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.BuildConfig
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.plan.GeneratedSubject
import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.PlanStreams
import com.latentic.graspy.plan.countryName
import com.latentic.graspy.plan.languageName
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrl

/** Up to this many subjects, as the web allows. */
const val SUBJECT_SELECTION_LIMIT = 15

enum class SetupStep { PROFILE, SUBJECTS }

/** The subjects taught at the learner's level, as they arrive, and those chosen. */
data class SubjectChoices(
    val available: List<GeneratedSubject> = emptyList(),
    val chosen: List<String> = emptyList(),
    val loading: Boolean = false,
    val failed: Boolean = false,
)

/** Making the plan: the timeline stage shown, then the plan made; [failed] when it stopped. */
data class Setup(val stage: Int = 0, val made: LearnerPlan? = null, val failed: Boolean = false)

/** The subjects taught at a level, each time more arrive; the stream's own error, if it sent one. */
typealias SubjectsSource = suspend (country: String, language: String, gradeLevel: String, onSubjects: (List<GeneratedSubject>) -> Unit) -> String?

/** Unchanged when choosing one more would pass the limit. */
fun toggledSelection(selected: List<String>, id: String): List<String> = when {
    id in selected -> selected - id
    selected.size >= SUBJECT_SELECTION_LIMIT -> selected
    else -> selected + id
}

/** The recommended subjects start chosen, as the web seeds them. */
fun seededSelection(available: List<GeneratedSubject>): List<String> = available.filter { it.recommended }.map { it.id }

/**
 * A plan made as the web's onboarding makes one (features/onboarding): the learner's details, then the
 * subjects taught at their level, then the plan, with a timeline that moves however long the plan takes.
 */
class PlanSetupViewModel(private val subjectsAt: SubjectsSource) : ViewModel() {
    private val stepShown = MutableStateFlow(SetupStep.PROFILE)
    private val subjectsShown = MutableStateFlow(SubjectChoices())
    private val setupShown = MutableStateFlow<Setup?>(null)
    private val activeShown = MutableStateFlow(false)
    private val replanningShown = MutableStateFlow(false)
    private val keepingShown = MutableStateFlow(false)
    private val notKeptShown = MutableStateFlow(false)
    private var subjectsFor: LearnerDetails? = null
    private var reading: Job? = null
    private var making: Job? = null

    val step: StateFlow<SetupStep> = stepShown.asStateFlow()
    val subjects: StateFlow<SubjectChoices> = subjectsShown.asStateFlow()

    /** Null while the form shows. */
    val setup: StateFlow<Setup?> = setupShown.asStateFlow()

    /** From the first step until the learner leaves the plan it made. */
    val active: StateFlow<Boolean> = activeShown.asStateFlow()

    /**
     * Begun from a plan the learner already had, so leaving goes back to it. A first plan offers no way out until
     * the server keeps it, as the web's onboarding offers Back only to a replan: the plan shown while it is being
     * kept is not the learner's yet.
     */
    val replanning: StateFlow<Boolean> = replanningShown.asStateFlow()

    /** While the plan of a class that learns by voice alone is being kept. */
    val keeping: StateFlow<Boolean> = keepingShown.asStateFlow()

    /** The last try to keep such a plan stopped. */
    val notKept: StateFlow<Boolean> = notKeptShown.asStateFlow()

    /** A learner replanning from their details goes straight to the subjects taught at [replanFor]. */
    fun begin(replanFor: LearnerDetails?) {
        activeShown.value = true
        replanningShown.value = replanFor != null
        setupShown.value = null
        if (replanFor == null) stepShown.value = SetupStep.PROFILE else toSubjects(replanFor)
    }

    fun toProfile() {
        stepShown.value = SetupStep.PROFILE
    }

    /** Asked each time the subjects step opens for other details; the first to arrive seed the choice. */
    fun toSubjects(details: LearnerDetails) {
        stepShown.value = SetupStep.SUBJECTS
        if (details != subjectsFor || subjectsShown.value.failed) readSubjects(details)
    }

    fun toggle(id: String) = subjectsShown.update { it.copy(chosen = toggledSelection(it.chosen, id)) }

    fun readSubjects(details: LearnerDetails) {
        subjectsFor = details
        reading?.cancel()
        subjectsShown.value = SubjectChoices(loading = true)
        reading = viewModelScope.launch {
            try {
                val failure = subjectsAt(countryName(details.country), languageName(details.language), details.gradeLevel) { found ->
                    subjectsShown.update { current ->
                        current.copy(available = found, chosen = current.chosen.ifEmpty { seededSelection(found) })
                    }
                }
                subjectsShown.update { it.copy(loading = false, failed = failure != null && it.available.isEmpty()) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "The subjects did not load", error)
                subjectsShown.update { it.copy(loading = false, failed = it.available.isEmpty()) }
            }
        }
    }

    /** Makes the plan with [make], pacing the timeline; the plan shows ready once both are done. */
    fun make(details: LearnerDetails, make: suspend (LearnerDetails, List<String>) -> LearnerPlan) {
        val chosen = subjectsShown.value.let { choices -> choices.chosen.mapNotNull { id -> choices.available.firstOrNull { it.id == id }?.label } }
        making?.cancel()
        setupShown.value = Setup()
        making = viewModelScope.launch {
            val pace = launch { pace() }
            try {
                val plan = make(details, chosen)
                pace.join()
                setupShown.value = Setup(stage = STAGES - 1, made = plan)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "The plan was not made", error)
                pace.cancel()
                setupShown.update { it?.copy(failed = true) }
            }
        }
    }

    /**
     * A class that learns by voice alone has no subjects to choose and no plan to wait for: its plan is kept with
     * [keep] and handed to [onKept] at once. One not kept leaves the learner on their details, to try again.
     */
    fun keep(details: LearnerDetails, keep: suspend (LearnerDetails) -> LearnerPlan, onKept: (LearnerPlan) -> Unit) {
        if (keepingShown.value) return
        keepingShown.value = true
        notKeptShown.value = false
        setupShown.value = null
        making = viewModelScope.launch {
            try {
                onKept(keep(details))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "The plan was not kept", error)
                notKeptShown.value = true
            } finally {
                keepingShown.value = false
            }
        }
    }

    /** Back to the subjects, to choose again. */
    fun adjust() {
        making?.cancel()
        setupShown.value = null
    }

    fun finish() {
        activeShown.value = false
        replanningShown.value = false
        setupShown.value = null
        stepShown.value = SetupStep.PROFILE
    }

    val chosenLabels: List<String>
        get() = subjectsShown.value.let { choices -> choices.chosen.mapNotNull { id -> choices.available.firstOrNull { it.id == id }?.label } }

    private suspend fun pace() {
        for (stage in 1 until STAGES) {
            delay(STEP_MS)
            setupShown.update { it?.copy(stage = maxOf(it.stage, stage)) }
        }
    }

    companion object {
        private const val TAG = "GraspySetup"
        private const val STAGES = 3
        private const val STEP_MS = 1_500L

        /** The subjects as the server streams them, asked as [learnerKey]. */
        fun forLearner(application: Application, learnerKey: String) =
            PlanSetupViewModel(PlanStreams(AppGraph.callsFor(application, learnerKey), BuildConfig.API_BASE_URL.toHttpUrl())::subjects)
    }
}
