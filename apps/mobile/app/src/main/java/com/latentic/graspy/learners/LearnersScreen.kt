package com.latentic.graspy.learners

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space

/** Renames and removes the account's learners, and deletes the account. */
@Composable
fun LearnersScreen(
    copy: AccountCopy,
    learnerInUse: String?,
    viewModel: LearnersViewModel,
    onBack: () -> Unit,
    onLeftLearner: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }
    BackHandler(onBack = onBack)
    AccountFrame {
        Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
            BackLink(copy.back, onBack)
            AccountHeading(copy.manageTitle)
        }
        LearnerList(copy, state, learnerInUse, viewModel, onLeftLearner)
        if (state.failed) ProblemNote(copy.failed)
        DeleteAccount(copy, state.busy, viewModel::deleteAccount)
    }
}

@Composable
private fun LearnerList(
    copy: AccountCopy,
    state: LearnersState,
    learnerInUse: String?,
    viewModel: LearnersViewModel,
    onLeftLearner: () -> Unit,
) {
    val learners = state.learners
    if (learners == null) {
        if (state.failed) SecondaryButton(copy.tryAgain, onClick = viewModel::load)
        else CircularProgressIndicator(color = GraspyColor.Accent, modifier = Modifier.size(28.dp))
        return
    }
    Card {
        learners.forEachIndexed { index, learner ->
            if (index > 0) HorizontalDivider(color = GraspyColor.Line)
            Column(Modifier.padding(horizontal = space(4), vertical = space(3.5))) {
                LearnerRow(
                    copy = copy,
                    learner = learner,
                    inUse = learner.id == learnerInUse,
                    busy = state.busy,
                    onRename = { name, onSaved -> viewModel.rename(learner.id, name, onSaved) },
                    onRemove = { viewModel.remove(learner.id, onLeftLearner) },
                )
            }
        }
    }
}

@Composable
private fun DeleteAccount(copy: AccountCopy, busy: Boolean, onDelete: () -> Unit) {
    var asking by rememberSaveable { mutableStateOf(false) }
    Card {
        Column(Modifier.padding(space(4)), verticalArrangement = Arrangement.spacedBy(space(3))) {
            Text(copy.deleteAccount, color = GraspyColor.Ink, style = MaterialTheme.typography.titleMedium)
            Text(copy.deleteBody, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
            if (asking) {
                ConfirmCard(copy.deleteConfirm, copy.deleteYes, copy.cancel, busy, onDelete) { asking = false }
            } else {
                SecondaryButton(copy.deleteAccount, onClick = { asking = true })
            }
        }
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(GraspyRadius.Card)
    Column(
        Modifier
            .fillMaxWidth()
            .background(GraspyColor.Surface, shape)
            .border(BorderStroke(1.dp, GraspyColor.Line), shape),
    ) {
        content()
    }
}
