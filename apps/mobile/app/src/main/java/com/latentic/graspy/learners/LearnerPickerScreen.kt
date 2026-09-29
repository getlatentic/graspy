package com.latentic.graspy.learners

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.account.Account
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.tapping
import com.latentic.graspy.ui.space

/** The most learners one account holds. */
const val MAX_LEARNERS = 8

/** "Who's learning?". [onBack] returns to the learner in use, when there is one. */
@Composable
fun LearnerPickerScreen(
    copy: AccountCopy,
    account: Account,
    viewModel: LearnerPickerViewModel,
    onBack: (() -> Unit)?,
    onChosen: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val activity = checkNotNull(LocalActivity.current) { "The app is drawn in an activity" }
    LaunchedEffect(account.uid) { viewModel.load() }
    BackHandler(enabled = state.adding && !state.busy) { viewModel.stopAdding() }
    BackHandler(enabled = state.consenting != null && !state.busy) { viewModel.declineConsent() }
    BackHandler(enabled = !state.adding && state.consenting == null && onBack != null) { onBack?.invoke() }
    val learners = state.learners
    val consenting = state.consenting
    AccountFrame {
        when {
            learners == null && state.loadFailed -> LoadFailed(copy, viewModel::load)
            learners == null -> CircularProgressIndicator(color = GraspyColor.Accent, modifier = Modifier.size(28.dp))
            state.adding -> AddLearnerForm(copy, state.busy, { viewModel.addAndChoose(it, activity, onChosen) }, viewModel::stopAdding)
            consenting != null -> LearnerConsent(
                copy = copy,
                learnerName = consenting.name,
                busy = state.busy,
                onAgree = { viewModel.agreeAndChoose(consenting, activity, onChosen) },
                onCancel = viewModel::declineConsent,
            )
            else -> Choosing(copy, account, learners, state, onBack, { viewModel.choose(it, onChosen) }, viewModel::startAdding)
        }
        if (learners != null) {
            ChoiceStatus(copy, state, { viewModel.anyway(onChosen) }, viewModel::cancel)
            AccountLine(copy, account, !state.busy, viewModel::leaveForAnotherAccount)
        }
    }
}

@Composable
private fun Choosing(
    copy: AccountCopy,
    account: Account,
    learners: List<LearnerDto>,
    state: PickerState,
    onBack: (() -> Unit)?,
    onChoose: (LearnerDto) -> Unit,
    onAdd: () -> Unit,
) {
    val full = learners.size >= MAX_LEARNERS
    Column(verticalArrangement = Arrangement.spacedBy(space(6))) {
        Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
            onBack?.let { BackLink(copy.back, it) }
            AccountHeading(copy.title)
        }
        TileGrid(learners.map(PickerTile::Learner) + listOfNotNull(PickerTile.Add.takeIf { !full })) { tile ->
            when (tile) {
                is PickerTile.Learner ->
                    LearnerTile(tile.learner, tile.learner.id == account.learner?.id, copy, !state.busy) {
                        onChoose(tile.learner)
                    }
                PickerTile.Add -> AddLearnerTile(copy.addTile, !state.busy, onAdd)
            }
        }
        if (full) Text(copy.full, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
        if (account.deviceJoins && state.deviceHoldsLearning) DevicePlanNote(copy.devicePlan)
    }
}

private sealed interface PickerTile {
    data class Learner(val learner: LearnerDto) : PickerTile

    data object Add : PickerTile
}

/** Two tiles to a row: a name under each face stays readable on a phone. */
@Composable
private fun TileGrid(tiles: List<PickerTile>, tile: @Composable (PickerTile) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        tiles.chunked(TILES_PER_ROW).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(space(2))) {
                row.forEach { Column(Modifier.weight(1f)) { tile(it) } }
                repeat(TILES_PER_ROW - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun DevicePlanNote(text: String) {
    Text(
        text,
        color = GraspyColor.Ink,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier
            .fillMaxWidth()
            .background(GraspyColor.AccentSoft, RoundedCornerShape(GraspyRadius.Card))
            .padding(space(4)),
    )
}

@Composable
private fun LoadFailed(copy: AccountCopy, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
        ProblemNote(copy.loadFailed)
        SecondaryButton(copy.tryAgain, onClick = onRetry)
    }
}

/** Opening the learner, or why not; a switch that would lose what is unsent asks first, as sign-out does. */
@Composable
internal fun ChoiceStatus(copy: AccountCopy, state: PickerState, onAnyway: () -> Unit, onCancel: () -> Unit) {
    if (state.busy) {
        if (state.leaving) return
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(space(2))) {
            CircularProgressIndicator(color = GraspyColor.Accent, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            Text(copy.opening, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
        }
        return
    }
    when (state.problem ?: return) {
        ChoiceProblem.UNSENT -> ConfirmCard(copy.unsent, copy.switchAnyway, copy.cancel, busy = false, onAnyway, onCancel)
        ChoiceProblem.OFFLINE -> ProblemNote(copy.offline)
        ChoiceProblem.FULL -> ProblemNote(copy.full)
        ChoiceProblem.OTHER_ACCOUNT -> ProblemNote(copy.consent.otherAccount)
        ChoiceProblem.SIGN_IN -> ProblemNote(copy.consent.signIn)
        ChoiceProblem.NOT_KEPT -> ProblemNote(copy.consent.notKept)
        ChoiceProblem.FAILED -> ProblemNote(copy.failed)
    }
}

/** The account signed in; before a learner is chosen, a wrong one can be left without losing anything. */
@Composable
private fun AccountLine(copy: AccountCopy, account: Account, enabled: Boolean, onOtherAccount: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
        HorizontalDivider(color = GraspyColor.Line)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(space(1.5)), verticalArrangement = Arrangement.spacedBy(space(1))) {
            account.email?.let { Text(it, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium) }
            if (account.deviceJoins) {
                if (account.email != null) Text("·", color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
                Text(
                    copy.otherAccount,
                    color = GraspyColor.AccentInk,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clickable(enabled = enabled, onClick = tapping(onOtherAccount)),
                )
            }
        }
    }
}

private const val TILES_PER_ROW = 2
