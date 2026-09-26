package com.latentic.graspy.learners

import androidx.activity.compose.BackHandler
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
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.tapping

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
    LaunchedEffect(account.uid) { viewModel.load() }
    BackHandler(enabled = state.adding && !state.busy) { viewModel.stopAdding() }
    BackHandler(enabled = !state.adding && onBack != null) { onBack?.invoke() }
    val learners = state.learners
    AccountFrame {
        when {
            learners == null && state.loadFailed -> LoadFailed(copy, viewModel::load)
            learners == null -> CircularProgressIndicator(color = Graspy.Brand, modifier = Modifier.size(28.dp))
            state.adding -> AddLearnerForm(copy, state.busy, { viewModel.addAndChoose(it, onChosen) }, viewModel::stopAdding)
            else -> Choosing(copy, account, learners, state, onBack, { viewModel.choose(it, onChosen) }, viewModel::startAdding)
        }
        if (learners != null) {
            Status(copy, state)
            AccountLine(copy, account, viewModel::leaveForAnotherAccount)
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
    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            onBack?.let { BackLink(copy.back, it) }
            AccountHeading(copy.title)
        }
        TileGrid(learners.map(PickerTile::Learner) + listOfNotNull(PickerTile.Add.takeIf { !full })) { tile ->
            when (tile) {
                is PickerTile.Learner ->
                    LearnerTile(tile.learner, tile.learner.id == account.learner?.id, copy.inUse, !state.busy) {
                        onChoose(tile.learner)
                    }
                PickerTile.Add -> AddLearnerTile(copy.addTile, !state.busy, onAdd)
            }
        }
        if (full) Text(copy.full, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyMedium)
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
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tiles.chunked(TILES_PER_ROW).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
        color = Graspy.Text,
        style = MaterialTheme.typography.bodyMedium,
        modifier = Modifier
            .fillMaxWidth()
            .background(Graspy.AccentSurface, RoundedCornerShape(16.dp))
            .padding(16.dp),
    )
}

@Composable
private fun LoadFailed(copy: AccountCopy, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ProblemNote(copy.loadFailed)
        SecondaryButton(copy.tryAgain, onClick = onRetry)
    }
}

@Composable
private fun Status(copy: AccountCopy, state: PickerState) {
    if (state.busy) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CircularProgressIndicator(color = Graspy.Brand, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            Text(copy.opening, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyMedium)
        }
        return
    }
    val problem = state.problem ?: return
    ProblemNote(
        when (problem) {
            ChoiceProblem.UNSENT -> copy.unsent
            ChoiceProblem.FULL -> copy.full
            ChoiceProblem.FAILED -> copy.failed
        },
    )
}

/** The account signed in; before a learner is chosen, a wrong one can be left without losing anything. */
@Composable
private fun AccountLine(copy: AccountCopy, account: Account, onOtherAccount: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        HorizontalDivider(color = Graspy.Border)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            account.email?.let { Text(it, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyMedium) }
            if (account.deviceJoins) {
                if (account.email != null) Text("·", color = Graspy.TextMuted, style = MaterialTheme.typography.bodyMedium)
                Text(
                    copy.otherAccount,
                    color = Graspy.AccentText,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clickable(onClick = tapping(onOtherAccount)),
                )
            }
        }
    }
}

private const val TILES_PER_ROW = 2
