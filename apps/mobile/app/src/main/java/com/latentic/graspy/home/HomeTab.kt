package com.latentic.graspy.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.CurrentTopic
import com.latentic.graspy.plan.Making
import com.latentic.graspy.plan.PlanSubject
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.currentTopic
import com.latentic.graspy.plan.levelLabel
import com.latentic.graspy.subjects.SubjectBadge
import com.latentic.graspy.subjects.subjectIcon
import com.latentic.graspy.subjects.subjectTint
import com.latentic.graspy.ui.GraspyCard
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PillButton
import com.latentic.graspy.ui.ProgressBar
import com.latentic.graspy.ui.Section
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

/**
 * Home, laid out as the web's: the topic to continue, when the learner has a plan; voice lessons; then
 * the plan's subjects. Voice lessons stay in full here, where the web shows a card that opens them.
 */
@Composable
fun HomeTab(
    learn: LearnCopy,
    plan: PlanState,
    making: Making?,
    onRetryMaking: () -> Unit,
    onOpenTopic: (PlanSubject, Int) -> Unit,
    onOpenSubject: (PlanSubject) -> Unit,
    onSeeAllSubjects: () -> Unit,
    voiceLessons: (@Composable () -> Unit)?,
) {
    val ready = (plan as? PlanState.Ready)?.takeIf { making == null }
    Column(verticalArrangement = Arrangement.spacedBy(space(8))) {
        making?.let { PlanBuilding(learn, it, onRetryMaking) }
        val current = ready?.let { currentTopic(it.plan) }
        if (ready != null && current != null) ContinueSection(learn, ready, current, onOpenTopic)
        voiceLessons?.let { Section(learn.voice.title) { it() } }
        ready?.plan?.subjects?.takeIf { it.isNotEmpty() }?.let { subjects ->
            Section(learn.home.subjectsTitle, more = learn.home.seeAll to onSeeAllSubjects) {
                SubjectTiles(subjects, onOpenSubject)
            }
        }
    }
}

@Composable
private fun ContinueSection(learn: LearnCopy, ready: PlanState.Ready, current: CurrentTopic, onOpenTopic: (PlanSubject, Int) -> Unit) {
    val plan = ready.plan
    val topics = plan.topicsOf(current.subject.slug)
    val total = topics.size
    val completed = ready.marks.learntIn(current.subject.slug, topics)
    Section(learn.home.continueTitle) {
        GraspyCard(contentPadding = space(3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(space(3)), verticalAlignment = Alignment.CenterVertically) {
                SubjectBadge(current.subject.name, size = space(14))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(space(0.5))) {
                    Text(current.topic, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(
                        learn.home.resumeMeta.filled("subject" to current.subject.name, "grade" to plan.levelLabel(learn)),
                        style = MaterialTheme.typography.bodySmall,
                        color = GraspyColor.Muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    ProgressBar(if (total == 0) 0f else completed.toFloat() / total, Modifier.padding(top = space(1.5)))
                    Text(
                        learn.home.topicsCompleted.filled("completed" to completed, "total" to total),
                        style = MaterialTheme.typography.bodySmall,
                        color = GraspyColor.Muted,
                    )
                }
                PillButton(if (current.started) learn.home.`continue` else learn.home.start) { onOpenTopic(current.subject, current.index) }
            }
        }
    }
}

/** A plan being made, as the web's Home shows it; a stopped one offers to try again. */
@Composable
private fun PlanBuilding(learn: LearnCopy, making: Making, onRetry: () -> Unit) {
    GraspyCard {
        if (making.failed) {
            Text(learn.plan.buildFailed, style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Danger)
            PillButton(learn.plan.tryAgain, onRetry)
        } else {
            Text(learn.planBuilding.making, style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Ink)
            making.plan?.subjects?.takeIf { it.isNotEmpty() }?.let { subjects -> SubjectTiles(subjects) {} }
        }
    }
}

/** On a phone the next tile shows half in view, so the row reads as scrollable. */
@Composable
private fun SubjectTiles(subjects: List<PlanSubject>, onOpenSubject: (PlanSubject) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(space(2))) {
        subjects.forEach { subject ->
            val tint = subjectTint(subject.name)
            Column(
                Modifier
                    .width(space(24))
                    .heightIn(min = space(20))
                    .clip(RoundedCornerShape(GraspyRadius.Card))
                    .background(tint.ground)
                    .clickable(onClick = tapping { onOpenSubject(subject) })
                    .padding(horizontal = space(1), vertical = space(2.5)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(space(1), Alignment.CenterVertically),
            ) {
                Icon(rememberLucide(subjectIcon(subject.name)), contentDescription = null, tint = tint.ink, modifier = Modifier.size(space(6)))
                Text(
                    subject.name,
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = MaterialTheme.typography.labelLarge.fontWeight),
                    color = GraspyColor.Ink,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
