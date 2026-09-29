package com.latentic.graspy.recordings

import android.app.Application
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.localization.AccountCopy

/**
 * One learner's voice recordings, for their parent. What the screen holds of the child, their transcripts and the
 * recording that plays, lasts no longer than the screen does: leaving it, by any way, clears it.
 */
@Composable
fun RecordingsOf(
    copy: AccountCopy,
    learner: LearnerDto,
    onBack: () -> Unit,
    make: (Application) -> RecordingsViewModel = { RecordingsViewModel(it) },
) {
    val application = LocalContext.current.applicationContext as Application
    val store = remember(learner.id) { ViewModelStore() }
    DisposableEffect(store) { onDispose { store.clear() } }
    val viewModel = remember(store) {
        val factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = make(application) as T
        }
        ViewModelProvider(store, factory)[RecordingsViewModel::class.java]
    }
    RecordingsScreen(copy, learner, viewModel, onBack)
}
