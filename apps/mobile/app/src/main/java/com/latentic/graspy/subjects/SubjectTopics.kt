package com.latentic.graspy.subjects

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import com.latentic.graspy.learners.BackLink
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanSubject
import com.latentic.graspy.plan.Standing
import com.latentic.graspy.ui.GraspyCard
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PageTitle
import com.latentic.graspy.ui.ProgressBar
import com.latentic.graspy.ui.leftToRight
import com.latentic.graspy.ui.space

/** One subject's topics in order, each with where it stands; a topic opens its lesson. */
@Composable
fun SubjectTopics(learn: LearnCopy, ready: PlanState.Ready, subject: PlanSubject, onBack: () -> Unit, onOpenTopic: (Int) -> Unit) {
    val topics = ready.plan.topicsOf(subject.slug)
    val goal = ready.plan.goalIndex(subject.slug)
    val learnt = ready.marks.learntIn(subject.slug, topics)
    Column(verticalArrangement = Arrangement.spacedBy(space(6))) {
        Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
            BackLink(learn.subject.back, onBack)
            Row(horizontalArrangement = Arrangement.spacedBy(space(3)), verticalAlignment = Alignment.CenterVertically) {
                SubjectBadge(subject.name, size = space(11))
                PageTitle(subject.name)
            }
        }
        if (topics.isNotEmpty()) SubjectProgress(learn, learnt, topics.size)
        Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
            topics.forEachIndexed { index, topic ->
                TopicRow(learn, index + 1, topic, ready.marks.standing(subject.slug, index, topic), index == goal) { onOpenTopic(index) }
            }
        }
    }
}

@Composable
private fun SubjectProgress(learn: LearnCopy, learnt: Int, total: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        Row {
            Text(learn.subject.progressLabel, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = GraspyColor.Ink, modifier = Modifier.weight(1f))
            Text(learn.subject.progress.filled("done" to learnt, "total" to total), style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
        }
        ProgressBar(learnt.toFloat() / total)
    }
}

@Composable
private fun TopicRow(learn: LearnCopy, number: Int, topic: String, standing: Standing, isGoal: Boolean, onOpen: () -> Unit) {
    val (label, ground, ink) = when (standing) {
        Standing.LEARNT -> Triple(learn.subject.learnt, GraspyColor.WarningSoft, GraspyColor.Warning)
        Standing.READY -> Triple(learn.subject.ready, GraspyColor.AccentSoft, GraspyColor.AccentInk)
        Standing.NOT_STARTED -> Triple(learn.subject.notStarted, GraspyColor.Track, GraspyColor.Muted)
    }
    GraspyCard(contentPadding = space(4), border = if (standing == Standing.READY) GraspyColor.AccentLine else GraspyColor.Line, onClick = onOpen) {
        Row(horizontalArrangement = Arrangement.spacedBy(space(3)), verticalAlignment = Alignment.CenterVertically) {
            Text("$number", style = MaterialTheme.typography.labelLarge.leftToRight(), color = GraspyColor.Muted, modifier = Modifier.width(space(5)))
            Column(Modifier.weight(1f)) {
                Text(topic, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = GraspyColor.Ink)
                if (isGoal) Text(learn.subject.goal, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = GraspyColor.AccentInk)
            }
            StandingPill(label, ground, ink)
        }
    }
}

@Composable
private fun StandingPill(label: String, ground: Color, ink: Color) {
    Text(
        label,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.SemiBold,
        color = ink,
        modifier = Modifier.background(ground, RoundedCornerShape(GraspyRadius.Pill)).padding(horizontal = space(2.5), vertical = space(0.5)),
    )
}
