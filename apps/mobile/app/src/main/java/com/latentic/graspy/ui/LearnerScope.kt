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

/**
 * The learner in use's view models: their lesson, their home screen, their recordings. They outlive
 * a rotation, and are cleared the moment the device leaves that learner, so nothing of one learner is
 * on screen for the next.
 */
class LearnerViewModels : ViewModel() {
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
    val owner = remember(learnerKey) { LearnerOwner(viewModels.storeFor(learnerKey), application) }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner, content = content)
}

private class LearnerOwner(
    override val viewModelStore: ViewModelStore,
    application: Application,
) : ViewModelStoreOwner, HasDefaultViewModelProviderFactory {
    override val defaultViewModelProviderFactory: ViewModelProvider.Factory =
        ViewModelProvider.AndroidViewModelFactory.getInstance(application)

    override val defaultViewModelCreationExtras: CreationExtras =
        MutableCreationExtras().apply { set(ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY, application) }
}
