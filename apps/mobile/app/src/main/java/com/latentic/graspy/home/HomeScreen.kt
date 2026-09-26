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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.tapping

/** Home: the next lesson as the only action, then the class's lessons and how each one stands. */
@Composable
fun HomeScreen(
    copy: AppCopy,
    state: CatalogueState,
    teacherName: String,
    teacherInitial: String,
    language: String,
    onStartLesson: () -> Unit,
    onOpenLesson: (String) -> Unit,
    onRetry: () -> Unit,
) {
    Surface(Modifier.fillMaxSize(), color = Graspy.Background) {
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Text(copy.home.title, color = Graspy.Text, style = MaterialTheme.typography.headlineMedium)
            when (state) {
                CatalogueState.Loading ->
                    Text(copy.home.loading, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyLarge)
                CatalogueState.Failed -> RetryLine(copy.home, onRetry)
                is CatalogueState.Ready -> {
                    TeacherStrip(teacherName, teacherInitial, language)
                    if (state.topics.isEmpty()) {
                        Text(copy.home.noLessons, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyLarge)
                    }
                    state.topics.forEach { group ->
                        TopicGroup(copy, group, state.current?.planId, onStartLesson, onOpenLesson)
                    }
                    MasteryBadges(copy, state.topics.flatMap { it.lessons }.masteryShelf())
                }
            }
        }
    }
}

@Composable
private fun RetryLine(copy: HomeCopy, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(copy.loadFailed, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyLarge)
        Button(
            onClick = tapping(onRetry),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.height(52.dp),
        ) {
            Text(copy.retry, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/** Who is teaching, said once, so no lesson row has to repeat it. */
@Composable
private fun TeacherStrip(name: String, initial: String, language: String) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .background(Graspy.Surface, shape)
            .border(BorderStroke(1.dp, Graspy.Hairline), shape)
            .padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(46.dp).background(Graspy.Brand, CircleShape), contentAlignment = Alignment.Center) {
            Text(initial, color = Graspy.OnAction, style = MaterialTheme.typography.titleMedium)
        }
        Column {
            Text(name, color = Graspy.Text, style = MaterialTheme.typography.titleMedium)
            Text(
                language,
                color = Graspy.TextMuted,
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
    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
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
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = tapping(onToggle))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            name,
            style = MaterialTheme.typography.titleMedium,
            color = Graspy.Text,
            modifier = Modifier.weight(1f),
        )
        Text(
            "$done / $total",
            style = MaterialTheme.typography.labelMedium,
            color = Graspy.TextMuted,
        )
        Icon(
            if (open) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,
            contentDescription = null,
            tint = Graspy.Brand,
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
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (current) Graspy.AccentSurface else Graspy.Surface, shape)
            .border(BorderStroke(1.dp, if (current) Graspy.AccentBorder else Graspy.Hairline), shape)
            .clickable(onClick = tapping(onOpen))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = Graspy.Text,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (current) {
                Text(copy.home.startHere, color = Graspy.Brand, style = MaterialTheme.typography.labelSmall)
            }
        }
        Text(
            badge.label,
            color = badge.text,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .background(badge.pill, RoundedCornerShape(999.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}
