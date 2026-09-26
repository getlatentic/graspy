package com.latentic.graspy.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.sync.LessonRefreshRequest
import com.latentic.graspy.sync.RefreshState
import com.latentic.graspy.sync.lessonRefreshWorkName
import com.latentic.graspy.sync.networkReach
import com.latentic.graspy.sync.refreshState
import com.latentic.graspy.sync.toLesson
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn

sealed interface CatalogueState {
    /** Nothing is stored yet and the first refresh is still running. */
    data object Loading : CatalogueState

    data class Ready(
        val current: CatalogueLesson?,
        val topics: List<TopicLessons>,
        val refreshing: Boolean,
    ) : CatalogueState

    /** Nothing is stored yet and the Worker cannot be reached. */
    data object Failed : CatalogueState
}

/**
 * What Home shows. Stored lessons win however old they are: only a learner who has never synced
 * waits, and only one who has never synced and cannot reach the Worker is told so.
 */
fun catalogueState(
    lessons: List<CatalogueLesson>,
    refresh: RefreshState,
    online: Boolean,
): CatalogueState = when {
    lessons.isNotEmpty() ->
        CatalogueState.Ready(lessons.currentLesson(), lessons.byTopic(), refresh == RefreshState.RUNNING)
    refresh == RefreshState.SUCCEEDED -> CatalogueState.Ready(null, emptyList(), false)
    refresh == RefreshState.FAILED || !online -> CatalogueState.Failed
    else -> CatalogueState.Loading
}

private data class OpenCatalogue(
    val ownerId: String,
    val learnerClass: String,
    val language: AppLanguage,
)

/** Home reads the learner's stored catalogue and asks WorkManager to bring a newer one. */
class HomeCatalogueViewModel(application: Application) : AndroidViewModel(application) {
    private val dao = AppGraph.database(application).lessonCacheDao()
    private val scheduler = AppGraph.lessonRefreshScheduler(application)
    private val workManager = WorkManager.getInstance(application)
    private val opened = MutableStateFlow<OpenCatalogue?>(null)

    @OptIn(ExperimentalCoroutinesApi::class)
    val state: StateFlow<CatalogueState> = opened.filterNotNull()
        .flatMapLatest(::screenState)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(KEEP_ALIVE_MILLIS), CatalogueState.Loading)

    fun open(language: AppLanguage, schoolClass: SchoolClass) {
        val ownerId = requireNotNull(AppGraph.account(getApplication()).learnerInUse())
        opened.value = OpenCatalogue(ownerId, schoolClass.wireValue, language)
        scheduler.refresh(LessonRefreshRequest(ownerId, schoolClass.wireValue, language))
    }

    private fun screenState(open: OpenCatalogue): Flow<CatalogueState> = combine(
        dao.observeCatalogue(open.ownerId, open.learnerClass),
        workManager.getWorkInfosForUniqueWorkFlow(lessonRefreshWorkName(open.ownerId)),
        networkReach(getApplication()),
    ) { stored, refreshes, online ->
        catalogueState(
            lessons = stored.map { it.toLesson(open.language) },
            refresh = refreshState(refreshes.map { it.state }),
            online = online,
        )
    }

    private companion object {
        const val KEEP_ALIVE_MILLIS = 5_000L
    }
}
