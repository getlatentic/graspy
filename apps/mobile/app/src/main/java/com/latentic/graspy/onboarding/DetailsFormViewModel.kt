package com.latentic.graspy.onboarding

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.account.learnerViewModelFactory
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.retrofit
import com.latentic.graspy.plan.COUNTRY_LANGUAGES
import com.latentic.graspy.plan.COURSE_MAX
import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.PlanApi
import com.latentic.graspy.plan.SchoolSystem
import com.latentic.graspy.plan.isAfterSchool
import com.latentic.graspy.plan.schoolDescriptor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** A country's school systems, the main one first, as the server lists them. */
sealed interface Systems {
    data object None : Systems

    data object Loading : Systems

    data object Failed : Systems

    data class Ready(val systems: List<SchoolSystem>) : Systems
}

/**
 * The learner's country, language and class as they choose them. A class belongs to one system, so another
 * system, or a country without the chosen one, asks for the class again; a level after school stays.
 */
class DetailsFormViewModel(private val schoolSystems: suspend (country: String) -> List<SchoolSystem>) : ViewModel() {
    private val shown = MutableStateFlow(DetailsForm())
    private val systemsShown = MutableStateFlow<Systems>(Systems.None)
    private var started = false
    private var reading: Job? = null

    val form: StateFlow<DetailsForm> = shown.asStateFlow()

    val systems: StateFlow<Systems> = systemsShown.asStateFlow()

    /** Once: the learner's details, or the phone's country and language for a first plan. */
    fun start(from: LearnerDetails?, phoneCountry: String?, phoneLanguage: String) {
        if (started) return
        started = true
        shown.value = from?.let(DetailsForm::of) ?: DetailsForm(
            country = phoneCountry?.takeIf(COUNTRY_LANGUAGES::containsKey).orEmpty(),
            language = phoneCountry?.let(COUNTRY_LANGUAGES::get)?.let { spoken -> spoken.firstOrNull { it == phoneLanguage } ?: spoken.first() }.orEmpty(),
        )
        readSystems()
    }

    /** The learner's own details, to change them. */
    fun load(details: LearnerDetails) {
        started = true
        shown.value = DetailsForm.of(details)
        readSystems()
    }

    fun chooseCountry(code: String) {
        shown.update { it.copy(country = code, language = COUNTRY_LANGUAGES[code]?.firstOrNull().orEmpty()) }
        readSystems()
    }

    fun chooseLanguage(code: String) = shown.update { it.copy(language = code) }

    fun chooseSystem(id: String) = shown.update { form ->
        if (isAfterSchool(form.level)) form.copy(system = id) else form.copy(system = id, level = "", school = null)
    }

    fun chooseLevel(id: String) {
        val system = (systemsShown.value as? Systems.Ready)?.systems?.firstOrNull { it.id == shown.value.system }
        val level = system?.levels?.firstOrNull { it.id == id }
        shown.update { it.copy(level = id, school = if (system != null && level != null) SchoolChoice(level.name, schoolDescriptor(system, level)) else null) }
    }

    fun setCourse(course: String) = shown.update { it.copy(course = course.take(COURSE_MAX)) }

    fun readSystems() {
        val country = shown.value.country.ifBlank { return }
        reading?.cancel()
        systemsShown.value = Systems.Loading
        reading = viewModelScope.launch {
            systemsShown.value = try {
                Systems.Ready(schoolSystems(country))
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                Log.w(TAG, "The school systems of $country did not load", error)
                Systems.Failed
            }
            keepSystemOnList()
        }
    }

    private fun keepSystemOnList() {
        val systems = (systemsShown.value as? Systems.Ready)?.systems ?: return
        if (systems.any { it.id == shown.value.system }) return
        chooseSystem(systems.firstOrNull()?.id.orEmpty())
    }

    companion object {
        private const val TAG = "GraspyDetails"

        /** The school systems as the server lists them, for the learner the device learns as. */
        val Factory = learnerViewModelFactory { application, learnerKey ->
            DetailsFormViewModel(retrofit(AppGraph.callsFor(application, learnerKey)).create(PlanApi::class.java)::schoolSystems)
        }
    }
}
