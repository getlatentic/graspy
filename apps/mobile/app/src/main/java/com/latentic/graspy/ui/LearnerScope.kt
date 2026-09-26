package com.latentic.graspy.ui

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.HasDefaultViewModelProviderFactory
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.MutableCreationExtras
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import com.latentic.graspy.ask.AskViewModel
import com.latentic.graspy.collection.CollectionViewModel
import com.latentic.graspy.home.HomeCatalogueViewModel
import com.latentic.graspy.mcp.LearnerViews
import com.latentic.graspy.onboarding.DetailsFormViewModel
import com.latentic.graspy.onboarding.PlanSetupViewModel
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.practice.PracticeLessonViewModel

/** How each view model that belongs to a learner is made, given that learner's key. */
typealias LearnerViewModelMakers = Map<Class<out ViewModel>, (Application, String) -> ViewModel>

/**
 * Every view model that belongs to a learner. Inside a [LearnerScope] a plain `viewModel()` makes one for
 * the scope's learner. The device's learner can go at any moment (forgotten on another device), before
 * their screens do; a view model bound when it is made keeps working for its own learner instead.
 */
val LEARNER_VIEW_MODELS: LearnerViewModelMakers = mapOf(
    AskViewModel::class.java to ::AskViewModel,
    CollectionViewModel::class.java to ::CollectionViewModel,
    DetailsFormViewModel::class.java to DetailsFormViewModel.Companion::forLearner,
    HomeCatalogueViewModel::class.java to ::HomeCatalogueViewModel,
    LearnerViews::class.java to ::LearnerViews,
    PlanSetupViewModel::class.java to PlanSetupViewModel.Companion::forLearner,
    PlanViewModel::class.java to ::PlanViewModel,
    PracticeLessonViewModel::class.java to ::PracticeLessonViewModel,
)

/**
 * The learner in use's view models: their lesson, their home screen, their recordings. They outlive
 * a rotation, and are cleared the moment the device leaves that learner, so nothing of one learner is
 * on screen for the next.
 */
class LearnerViewModels(val makers: LearnerViewModelMakers = LEARNER_VIEW_MODELS) : ViewModel() {
    private var learnerKey: String? = null
    private var store = ViewModelStore()

    fun keepOnly(key: String?) {
        if (key == learnerKey) return
        store.clear()
        store = ViewModelStore()
        learnerKey = key
    }

    fun storeFor(key: String): ViewModelStore {
        keepOnly(key)
        return store
    }

    override fun onCleared() = store.clear()
}

@Composable
fun LearnerScope(learnerKey: String, viewModels: LearnerViewModels, content: @Composable () -> Unit) {
    val application = LocalContext.current.applicationContext as Application
    val owner = remember(learnerKey) { LearnerOwner(viewModels.storeFor(learnerKey), LearnerFactory(application, learnerKey, viewModels.makers), application) }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner, content = content)
}

private class LearnerFactory(
    private val application: Application,
    private val learnerKey: String,
    private val makers: LearnerViewModelMakers,
) : ViewModelProvider.Factory {
    private val plain = ViewModelProvider.AndroidViewModelFactory.getInstance(application)

    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        val make = makers[modelClass]
        if (make != null) return modelClass.cast(make(application, learnerKey))
        check(madeWithoutALearner(modelClass)) { "${modelClass.simpleName} belongs to a learner: list it in LEARNER_VIEW_MODELS" }
        return plain.create(modelClass, extras)
    }
}

/** What the default factory can make: a view model taking nothing, or only the application. */
fun madeWithoutALearner(modelClass: Class<*>): Boolean =
    modelClass.constructors.any { it.parameterTypes.isEmpty() || it.parameterTypes.contentEquals(arrayOf(Application::class.java)) }

private class LearnerOwner(
    override val viewModelStore: ViewModelStore,
    override val defaultViewModelProviderFactory: ViewModelProvider.Factory,
    application: Application,
) : ViewModelStoreOwner, HasDefaultViewModelProviderFactory {
    override val defaultViewModelCreationExtras: CreationExtras =
        MutableCreationExtras().apply { set(ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY, application) }
}
