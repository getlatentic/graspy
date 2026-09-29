package com.latentic.graspy.learners

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.account.ChosenLearner
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space

/**
 * Opens [content] for the learner in use only once their parent has agreed to graspy teaching them. A learner this
 * device already learned as, before consent was asked, is looked up and, when none is held, asked for; the parent
 * who does not agree takes [onSwitchLearner].
 */
@Composable
fun ServiceConsentGate(
    copy: AccountCopy,
    learner: ChosenLearner,
    viewModel: ServiceConsentViewModel,
    onSwitchLearner: () -> Unit,
    content: @Composable () -> Unit,
) {
    if (learner.consented) return content()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val activity = checkNotNull(LocalActivity.current) { "The app is drawn in an activity" }
    LaunchedEffect(learner.id) { viewModel.check() }
    AccountFrame {
        when {
            state.checking -> CircularProgressIndicator(color = GraspyColor.Accent, modifier = Modifier.size(28.dp))
            state.checkFailed -> Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
                ProblemNote(copy.loadFailed)
                SecondaryButton(copy.tryAgain, onClick = viewModel::check)
                SecondaryButton(copy.switchLearner, onClick = onSwitchLearner)
            }
            else -> LearnerConsent(
                copy = copy,
                learnerName = learner.name,
                busy = state.busy,
                onAgree = { viewModel.agree(activity) },
                onCancel = onSwitchLearner,
                problem = state.problem,
            )
        }
    }
}
