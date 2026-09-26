package com.latentic.graspy.you

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import com.latentic.graspy.account.Account
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.practiceTally
import com.latentic.graspy.plan.subjectRows
import com.latentic.graspy.ui.AccountMenu
import com.latentic.graspy.ui.GraspyCard
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PageTitle
import com.latentic.graspy.ui.ProgressBar
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.icons.Lucide
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.leftToRight
import com.latentic.graspy.ui.space

/** A detail about the learner, as the web's details card lists them. */
data class LearnerDetail(val label: String, val value: String)

/** You, as the web's: progress, practice, the learner's details, and the account. */
@Composable
fun YouTab(learn: LearnCopy, plan: PlanState, details: List<LearnerDetail>, account: Account, menu: AccountMenu) {
    Column(verticalArrangement = Arrangement.spacedBy(space(6))) {
        PageTitle(learn.nav.you)
        (plan as? PlanState.Ready)?.let {
            ProgressSummary(learn, it)
            PracticeRecord(learn, it)
        }
        DetailsCard(learn, details, menu.onEditProfile)
        AccountCard(learn, account, menu)
    }
}

@Composable
private fun ProgressSummary(learn: LearnCopy, ready: PlanState.Ready) {
    val rows = subjectRows(ready.plan, ready.marks)
    val completed = rows.sumOf { it.completed }
    val total = rows.sumOf { it.total }
    if (total == 0) return
    GraspyCard {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(space(1))) {
            Text("$completed", style = MaterialTheme.typography.headlineMedium.leftToRight(), color = GraspyColor.AccentInk)
            Text(learn.home.topicsCompletedOf.filled("total" to total), style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Ink)
        }
        ProgressBar(completed.toFloat() / total)
    }
}

@Composable
private fun PracticeRecord(learn: LearnCopy, ready: PlanState.Ready) {
    val (total, bySubject) = practiceTally(ready.record.answers)
    GraspyCard {
        CardHeading(Lucide.PencilLine, learn.you.practice)
        if (total.answered == 0) {
            Text(learn.you.practiceNone, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
        } else {
            Text(
                learn.you.practiceRight.filled("right" to total.right, "answered" to total.answered),
                style = MaterialTheme.typography.headlineMedium,
                color = GraspyColor.AccentInk,
            )
            ready.plan.subjects.mapNotNull { subject -> bySubject[subject.slug]?.let { subject.name to it } }.forEach { (name, tally) ->
                Row {
                    Text(name, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Ink, modifier = Modifier.weight(1f))
                    Text(learn.you.practiceRight.filled("right" to tally.right, "answered" to tally.answered), style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
                }
            }
        }
    }
}

@Composable
private fun DetailsCard(learn: LearnCopy, details: List<LearnerDetail>, onChange: () -> Unit) {
    GraspyCard(contentPadding = space(0), gap = space(0)) {
        Row(Modifier.padding(start = space(5), end = space(2), top = space(2), bottom = space(1)), verticalAlignment = Alignment.CenterVertically) {
            Text(learn.you.details, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = GraspyColor.Muted, modifier = Modifier.weight(1f))
            QuietButton(learn.you.change, onChange)
        }
        details.forEachIndexed { index, (label, value) ->
            if (index > 0) HorizontalDivider(color = GraspyColor.Line)
            Row(Modifier.padding(horizontal = space(5), vertical = space(3)), horizontalArrangement = Arrangement.spacedBy(space(4))) {
                Text(label, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
                Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = GraspyColor.Ink, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun AccountCard(learn: LearnCopy, account: Account, menu: AccountMenu) {
    GraspyCard {
        CardHeading(Lucide.UserRound, learn.you.account)
        account.email?.let { Text(it, style = MaterialTheme.typography.bodyMedium.leftToRight(), color = GraspyColor.Muted) }
        account.learner?.let { Text(learn.you.learningAs.filled("name" to it.name), style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Ink) }
        Row(horizontalArrangement = Arrangement.spacedBy(space(2))) {
            SecondaryButton(learn.you.switchLearner, menu.onSwitchLearner)
            SecondaryButton(learn.you.manageLearners, menu.onManageLearners)
        }
        SecondaryButton(learn.you.signOut, menu.onSignOut)
    }
}

@Composable
private fun CardHeading(icon: Lucide, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(space(2))) {
        Icon(rememberLucide(icon), contentDescription = null, tint = GraspyColor.AccentInk, modifier = Modifier.size(space(4)))
        Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = GraspyColor.Muted)
    }
}
