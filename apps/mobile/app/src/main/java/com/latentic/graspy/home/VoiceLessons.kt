package com.latentic.graspy.home

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandLess
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.HomeCopy
import com.latentic.graspy.localization.topicName
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

/** Voice lessons: who teaches, the class's lessons by topic and how each stands, then the badges earned. */
@Composable
fun VoiceLessons(
    copy: AppCopy,
    state: CatalogueState,
    teacherName: String,
    teacherInitial: String,
    language: String,
    onStartLesson: () -> Unit,
    onOpenLesson: (String) -> Unit,
    onRetry: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
        when (state) {
            CatalogueState.Loading ->
                Text(copy.home.loading, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
            CatalogueState.Failed -> RetryLine(copy.home, onRetry)
            is CatalogueState.Ready -> {
                TeacherStrip(teacherName, teacherInitial, language)
                if (state.topics.isEmpty()) {
                    Text(copy.home.noLessons, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
                }
                state.topics.forEach { group ->
                    TopicGroup(copy, group, state.current?.planId, onStartLesson, onOpenLesson)
                }
                MasteryBadges(copy, state.topics.flatMap { it.lessons }.masteryShelf())
            }
        }
    }
}

@Composable
private fun RetryLine(copy: HomeCopy, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(2.5))) {
        Text(copy.loadFailed, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
        SecondaryButton(copy.retry, onRetry)
    }
}

/** Who is teaching, said once, so no lesson row has to repeat it. */
@Composable
private fun TeacherStrip(name: String, initial: String, language: String) {
    val shape = RoundedCornerShape(GraspyRadius.Card)
    Row(
        Modifier
            .fillMaxWidth()
            .background(GraspyColor.Surface, shape)
            .border(BorderStroke(1.dp, GraspyColor.Line), shape)
            .padding(space(3.5)),
        horizontalArrangement = Arrangement.spacedBy(space(3)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(46.dp).background(GraspyColor.Accent, CircleShape), contentAlignment = Alignment.Center) {
            Text(initial, color = GraspyColor.OnAccent, style = MaterialTheme.typography.titleMedium)
        }
        Column {
            Text(name, color = GraspyColor.Ink, style = MaterialTheme.typography.titleMedium)
            Text(
                language,
                color = GraspyColor.Muted,
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

@Composable
private fun TopicGroup(
    copy: AppCopy,
    group: TopicLessons,
    currentPlanId: String?,
    onStartLesson: () -> Unit,
    onOpenLesson: (String) -> Unit,
) {
    val holdsTonight = group.lessons.any { it.planId == currentPlanId }
    var open by rememberSaveable(group.topic) { mutableStateOf(holdsTonight) }
    val done = group.lessons.count { it.standing != LessonStanding.UNTOUCHED }
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        TopicRow(
            name = copy.topicName(group.topic),
            done = done,
            total = group.lessons.size,
            open = open,
            onToggle = { open = !open },
        )
        if (open) {
            group.lessons.forEach { lesson ->
                val current = lesson.planId == currentPlanId
                LessonCard(copy, standingBadge(copy.home, lesson.standing), lesson.title, current) {
                    if (current) onStartLesson() else onOpenLesson(lesson.planId)
                }
            }
        }
    }
}

/**
 * A theme, shut until it is wanted.
 *
 * Twelve times tables listed out is a wall a child scrolls past rather than reads. Shut, the whole
 * class is eight lines; the one holding tonight's lesson opens itself, so what to do next is still
 * on screen without a tap.
 */
@Composable
private fun TopicRow(name: String, done: Int, total: Int, open: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(GraspyRadius.Card))
            .clickable(onClick = tapping(onToggle))
            .padding(horizontal = space(4), vertical = space(3.5)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(2.5)),
    ) {
        Text(
            name,
            style = MaterialTheme.typography.titleMedium,
            color = GraspyColor.Ink,
            modifier = Modifier.weight(1f),
        )
        Text(
            "$done / $total",
            style = MaterialTheme.typography.labelMedium,
            color = GraspyColor.Muted,
        )
        Icon(
            if (open) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,
            contentDescription = null,
            tint = GraspyColor.Accent,
        )
    }
}

/**
 * One lesson, one card, one standing. The lesson the teacher would give next is marked rather than
 * lifted into a card of its own, so the screen carries one call to action instead of two.
 */
@Composable
private fun LessonCard(
    copy: AppCopy,
    badge: StandingBadge,
    title: String,
    current: Boolean,
    onOpen: () -> Unit,
) {
    val shape = RoundedCornerShape(GraspyRadius.Card)
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (current) GraspyColor.AccentSoft else GraspyColor.Surface, shape)
            .border(BorderStroke(1.dp, if (current) GraspyColor.AccentLine else GraspyColor.Line), shape)
            .clickable(onClick = tapping(onOpen))
            .padding(space(4)),
        horizontalArrangement = Arrangement.spacedBy(space(3)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = GraspyColor.Ink,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (current) {
                Text(copy.home.startHere, color = GraspyColor.AccentInk, style = MaterialTheme.typography.labelSmall)
            }
        }
        Text(
            badge.label,
            color = badge.text,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .background(badge.pill, RoundedCornerShape(GraspyRadius.Pill))
                .padding(horizontal = space(2.5), vertical = space(0.5)),
        )
    }
}
