package com.latentic.graspy.subjects

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanSubject
import com.latentic.graspy.plan.SubjectRow
import com.latentic.graspy.plan.subjectRows
import com.latentic.graspy.ui.ForwardChevron
import com.latentic.graspy.ui.GraspyCard
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PageTitle
import com.latentic.graspy.ui.ProgressBar
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.leftToRight
import com.latentic.graspy.ui.space

/** The plan's subjects and how far the learner is in each, read-only as on the web. */
@Composable
fun SubjectsTab(learn: LearnCopy, plan: PlanState, onOpenSubject: (PlanSubject) -> Unit, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(6))) {
        PageTitle(learn.nav.subjects)
        when (plan) {
            PlanState.Loading -> Text(learn.subject.topicsLoading, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
            PlanState.Failed -> PlanUnread(learn, onRetry)
            PlanState.None -> Text(learn.home.noSubjects, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
            is PlanState.Ready -> Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
                subjectRows(plan.plan, plan.marks).forEach { row -> SubjectRowCard(learn, row) { onOpenSubject(row.subject) } }
            }
        }
    }
}

@Composable
fun PlanUnread(learn: LearnCopy, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
        Text(learn.chat.temporaryProblem, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
        SecondaryButton(learn.lesson.tryAgain, onRetry)
    }
}

@Composable
private fun SubjectRowCard(learn: LearnCopy, row: SubjectRow, onOpen: () -> Unit) {
    GraspyCard(contentPadding = space(4), onClick = onOpen) {
        Row(horizontalArrangement = Arrangement.spacedBy(space(3)), verticalAlignment = Alignment.CenterVertically) {
            SubjectBadge(row.subject.name)
            Column(Modifier.weight(1f)) {
                Text(row.subject.name, style = MaterialTheme.typography.titleSmall, color = GraspyColor.Ink)
                row.nextTopic?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (row.completed > 0 && row.total > 0) {
                    ProgressBar(row.completed.toFloat() / row.total, Modifier.padding(top = space(2)))
                }
            }
            if (row.total > 0) {
                val spoken = learn.subject.lessonsCompleted.filled("completed" to row.completed, "total" to row.total)
                Text(
                    "${row.completed} / ${row.total}",
                    style = MaterialTheme.typography.labelLarge.leftToRight(),
                    color = GraspyColor.Muted,
                    modifier = Modifier.semantics { contentDescription = spoken },
                )
            }
            ForwardChevron()
        }
    }
}
