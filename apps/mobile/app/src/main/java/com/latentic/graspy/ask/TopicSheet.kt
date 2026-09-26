package com.latentic.graspy.ask

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.currentTopic
import com.latentic.graspy.plan.levelLabel
import com.latentic.graspy.ui.ForwardChevron
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PillButton
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

/** Changing the conversation, as the web's chat directory offers it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TopicSheet(learn: LearnCopy, threads: List<ChatThread>, plan: LearnerPlan, open: ThreadScope, onClose: () -> Unit, onPick: (ChatTarget) -> Unit) {
    val directory = chatDirectory(threads, plan, currentTopic(plan), open)
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = GraspyColor.Canvas) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(horizontal = space(4)).padding(bottom = space(4)).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(space(6)),
        ) {
            Text(learn.ask.changeTitle, style = MaterialTheme.typography.titleSmall, color = GraspyColor.Ink, modifier = Modifier.semantics { heading() })
            directory.topic?.let { (topic, target) ->
                Group(learn.ask.currentTopic) {
                    Row(Modifier.padding(space(4)), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(space(3))) {
                        ScopeIcon(plan, ThreadScope.Topic(plan.planId, topic.subject.slug, topic.topic), space(12))
                        Column(Modifier.weight(1f)) {
                            Text(topic.topic, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text("${topic.subject.name} · ${plan.levelLabel(learn)}", style = MaterialTheme.typography.bodySmall, color = GraspyColor.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        PillButton(learn.ask.open) { onPick(target) }
                    }
                }
            }
            if (directory.recent.isNotEmpty()) {
                Group(learn.ask.recent) {
                    directory.recent.forEachIndexed { index, (thread, target) ->
                        if (index > 0) HorizontalDivider(color = GraspyColor.Line)
                        ThreadRow(learn, plan, thread) { onPick(target) }
                    }
                }
            }
            if (directory.offerAnything) {
                Group(learn.ask.anythingTitle) {
                    val general = ThreadScope.General(plan.planId)
                    OptionRow(learn.ask.anything, directory.anything?.preview, { ScopeIcon(plan, general, space(10)) }) { onPick(ChatTarget.General) }
                }
            }
            if (directory.offerTopics) Group(learn.ask.chooseTopic) { SubjectChooser(learn, plan, onPick) }
        }
    }
}

@Composable
private fun ThreadRow(learn: LearnCopy, plan: LearnerPlan, thread: ChatThread, onOpen: () -> Unit) {
    val (title, _) = describe(learn, plan, thread.scope)
    val subject = when (val scope = thread.scope) {
        is ThreadScope.Topic -> plan.subject(scope.subjectSlug)?.name
        is ThreadScope.Subject -> plan.subject(scope.subjectSlug)?.name
        is ThreadScope.General -> null
    }
    val detail = listOfNotNull(subject, thread.preview).joinToString(" · ")
    OptionRow(title, detail.ifEmpty { null }, { ScopeIcon(plan, thread.scope, space(10)) }, onOpen)
}

@Composable
private fun OptionRow(title: String, detail: String?, icon: @Composable () -> Unit, onOpen: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = tapping(onOpen)).padding(horizontal = space(4), vertical = space(3)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(3)),
    ) {
        icon()
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = GraspyColor.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        ForwardChevron()
    }
}

/** A subject without topics opens at once; otherwise it opens to its topics. */
@Composable
private fun SubjectChooser(learn: LearnCopy, plan: LearnerPlan, onPick: (ChatTarget) -> Unit) {
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    plan.subjects.forEachIndexed { index, subject ->
        if (index > 0) HorizontalDivider(color = GraspyColor.Line)
        val topics = plan.topicsOf(subject.slug)
        OptionRow(subject.name, null, { ScopeIcon(plan, ThreadScope.Subject(plan.planId, subject.slug), space(9)) }) {
            if (topics.isEmpty()) onPick(ChatTarget.Subject(subject.slug)) else open = subject.slug.takeIf { it != open }
        }
        if (open == subject.slug) {
            Topic(learn.ask.allOf.filled("subject" to subject.name), strong = true) { onPick(ChatTarget.Subject(subject.slug)) }
            topics.forEachIndexed { topicIndex, topic -> Topic(topic) { onPick(ChatTarget.Topic(subject.slug, topicIndex)) } }
        }
    }
}

@Composable
private fun Topic(text: String, strong: Boolean = false, onPick: () -> Unit) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = if (strong) FontWeight.SemiBold else FontWeight.Normal,
        color = if (strong) GraspyColor.AccentInk else GraspyColor.Ink,
        modifier = Modifier.fillMaxWidth().clickable(onClick = tapping(onPick)).padding(start = space(16), end = space(4), top = space(2.5), bottom = space(2.5)),
    )
}

@Composable
private fun Group(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = GraspyColor.Ink, modifier = Modifier.semantics { heading() })
        val shape = RoundedCornerShape(GraspyRadius.Card)
        Column(Modifier.fillMaxWidth().clip(shape).background(GraspyColor.Surface).border(1.dp, GraspyColor.Line, shape), content = content)
    }
}
