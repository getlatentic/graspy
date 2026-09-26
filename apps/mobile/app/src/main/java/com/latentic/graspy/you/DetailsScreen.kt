package com.latentic.graspy.you

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.learners.BackLink
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.onboarding.DetailsFormViewModel
import com.latentic.graspy.onboarding.ProfileStep
import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.voiceOnly
import com.latentic.graspy.ui.GraspyCard
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PageTitle
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space
import java.util.Locale

/** What saving new details does to the plan, as the web's detailsSave. */
enum class DetailsSave { KEEP, NEW, ASK }

/**
 * A class that learns by voice alone shows no subjects, so its plan only takes the details, subjects and all. A plan
 * with no subjects has nothing to keep for another class; otherwise the learner chooses.
 */
fun detailsSave(next: LearnerDetails, planHasSubjects: Boolean): DetailsSave = when {
    next.voiceOnly -> DetailsSave.KEEP
    planHasSubjects -> DetailsSave.ASK
    else -> DetailsSave.NEW
}

/**
 * The learner's details, changed as the web changes them (app/learn/details-page.tsx): new details either get
 * a new plan, or the plan keeps its topics and takes the details, so the plan follows either way.
 */
@Composable
fun DetailsScreen(
    learn: LearnCopy,
    form: DetailsFormViewModel,
    current: LearnerDetails,
    planHasSubjects: Boolean,
    display: Locale,
    onBack: () -> Unit,
    onNewPlan: (LearnerDetails) -> Unit,
    onKeepPlan: (LearnerDetails) -> Unit,
) {
    val values by form.form.collectAsStateWithLifecycle()
    var asking by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(space(8))) {
        Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
            BackLink(learn.details.back, onBack)
            PageTitle(learn.details.title)
        }
        ProfileStep(learn, form, current.country, display)
        if (!asking) {
            PrimaryButton(learn.details.save, {
                val next = values.details()
                when (detailsSave(next, planHasSubjects)) {
                    DetailsSave.KEEP -> onKeepPlan(next)
                    DetailsSave.NEW -> onNewPlan(next)
                    DetailsSave.ASK -> asking = true
                }
            }, enabled = values.changes(current) && values.complete)
        } else {
            GraspyCard(Modifier.semantics { paneTitle = learn.details.askTitle }) {
                Text(learn.details.askTitle, style = MaterialTheme.typography.titleSmall, color = GraspyColor.Ink)
                Text(learn.details.askBody, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
                Row(horizontalArrangement = Arrangement.spacedBy(space(2))) {
                    PrimaryButton(learn.details.newPlan, { onNewPlan(values.details()) })
                    SecondaryButton(learn.details.keepPlan, { onKeepPlan(values.details()) })
                }
            }
        }
    }
}
