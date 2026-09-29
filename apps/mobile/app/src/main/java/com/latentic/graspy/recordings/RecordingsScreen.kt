package com.latentic.graspy.recordings

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.learners.AccountFrame
import com.latentic.graspy.learners.AccountHeading
import com.latentic.graspy.learners.BackLink
import com.latentic.graspy.learners.ConfirmCard
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space

/** A learner's voice recordings, for their parent. */
@Composable
fun RecordingsScreen(copy: AccountCopy, learner: LearnerDto, viewModel: RecordingsViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(learner.id) { viewModel.load(learner.id) }
    StopPlayingInTheBackground(viewModel)
    BackHandler(onBack = onBack)
    AccountFrame {
        Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
            BackLink(copy.back, onBack)
            AccountHeading(copy.recordings.title)
            Text(learner.name, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
        }
        when {
            state.loaded -> Recordings(copy, state, viewModel)
            state.loadFailed -> Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
                ProblemNote(copy.loadFailed)
                SecondaryButton(copy.tryAgain, onClick = { viewModel.load(learner.id) })
            }
            else -> CircularProgressIndicator(color = GraspyColor.Accent, modifier = Modifier.size(28.dp))
        }
    }
}

/** A recording does not play on while the app is out of sight: it stops, and its file goes. */
@Composable
private fun StopPlayingInTheBackground(viewModel: RecordingsViewModel) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, viewModel) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) viewModel.stopPlaying() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
}

@Composable
private fun Recordings(copy: AccountCopy, state: RecordingsState, viewModel: RecordingsViewModel) {
    val activity = checkNotNull(LocalActivity.current) { "The app is drawn in an activity" }
    val words = copy.recordings
    Column(verticalArrangement = Arrangement.spacedBy(space(5))) {
        KeepSwitch(words, state.consent, enabled = !state.busy && state.step == null, onToggle = viewModel::switchTapped)
        when (state.step) {
            RecordingsStep.KEEPING -> KeepStep(copy, state, viewModel::chooseDays, { viewModel.keep(activity) }, viewModel::dismiss)
            RecordingsStep.STOPPING -> StopStep(
                copy,
                state.busy,
                { viewModel.stop(deleteRecordings = true) },
                { viewModel.stop(deleteRecordings = false) },
                viewModel::dismiss,
            )
            RecordingsStep.DELETING_ALL ->
                ConfirmCard(words.deleteAllConfirm, words.deleteAll, copy.cancel, state.busy, viewModel::deleteAll, viewModel::dismiss)
            null -> Unit
        }
        if (state.step != RecordingsStep.KEEPING) state.problem?.let { ProblemNote(problemText(copy, it)) }
        KeptList(copy, state, viewModel)
    }
}

@Composable
private fun KeptList(copy: AccountCopy, state: RecordingsState, viewModel: RecordingsViewModel) {
    val words = copy.recordings
    if (state.recordings.isEmpty()) {
        if (state.keeping && state.step == null) Text(words.empty, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
        return
    }
    val shape = RoundedCornerShape(GraspyRadius.Card)
    Column(
        Modifier.fillMaxWidth().background(GraspyColor.Surface, shape).border(BorderStroke(1.dp, GraspyColor.Line), shape),
    ) {
        state.recordings.forEachIndexed { index, recording ->
            if (index > 0) HorizontalDivider(color = GraspyColor.Line)
            RecordingRow(
                copy = words,
                recording = recording,
                playing = state.playing == recording.id,
                fetching = state.fetching != null,
                busy = state.busy,
                onPlay = { viewModel.play(recording.id) },
                onDelete = { viewModel.delete(recording.id) },
            )
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        if (state.nextBefore != null) SecondaryButton(words.more, onClick = viewModel::more, enabled = !state.busy)
        if (state.step == null) QuietButton(words.deleteAll, onClick = viewModel::askDeleteAll, enabled = !state.busy)
    }
}

private fun problemText(copy: AccountCopy, problem: RecordingsProblem): String = when (problem) {
    RecordingsProblem.OTHER_ACCOUNT -> copy.consent.otherAccount
    RecordingsProblem.SIGN_IN -> copy.consent.signIn
    RecordingsProblem.NOT_KEPT -> copy.consent.notKept
    RecordingsProblem.FAILED -> copy.failed
    RecordingsProblem.GONE -> copy.recordings.gone
    RecordingsProblem.PLAY_FAILED -> copy.recordings.playFailed
}
