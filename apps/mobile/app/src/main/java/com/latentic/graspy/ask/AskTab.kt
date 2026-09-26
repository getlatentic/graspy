package com.latentic.graspy.ask

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.mcp.ViewServer
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.currentTopic
import com.latentic.graspy.plan.levelLabel
import com.latentic.graspy.subjects.SubjectBadge
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.icons.Lucide
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space

/**
 * Ask, as the web's: the latest conversation the plan still holds, else the topic Home continues, with a
 * way to change to another topic, a subject, or anything at all.
 */
@Composable
fun AskTab(learn: LearnCopy, locale: String, server: ViewServer, ask: AskViewModel, ready: PlanState.Ready, plan: PlanChanges, onLink: (LinkTarget) -> Unit) {
    val threads = ask.threads.collectAsStateWithLifecycle().value ?: return
    var chosen by rememberSaveable(stateSaver = targetSaver) { mutableStateOf<ChatTarget?>(null) }
    // Chosen once, so the conversation stays put while its thread and others change under it.
    val target = chosen?.takeIf { scopeOf(it, ready.plan) != null } ?: latestChat(threads, ready.plan, currentTopic(ready.plan)).also { chosen = it }
    val scope = scopeOf(target, ready.plan) ?: return
    var choosing by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(scope) { ask.open(scope) }
    val context = remember(ready.plan, scope, learn) { TurnContext(tutorContext(ready.plan, scope), plan, learn.chat) }

    Column(Modifier.fillMaxSize().background(GraspyColor.Surface)) {
        ContextBar(learn, ready.plan, scope) { choosing = true }
        HorizontalDivider(color = GraspyColor.Line)
        Conversation(learn, locale, server, ask, scope, context, onLink, Modifier.weight(1f))
    }
    if (choosing) {
        TopicSheet(learn, threads, ready.plan, scope, onClose = { choosing = false }) {
            chosen = it
            choosing = false
        }
    }
}

@Composable
private fun ContextBar(learn: LearnCopy, plan: LearnerPlan, scope: ThreadScope, onChange: () -> Unit) {
    val (title, detail) = describe(learn, plan, scope)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = space(4), vertical = space(2.5)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(3)),
    ) {
        ScopeIcon(plan, scope, space(9))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (detail.isNotEmpty()) {
                Text(detail, style = MaterialTheme.typography.bodySmall, color = GraspyColor.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        QuietButton(learn.ask.change, onChange)
    }
}

/** A conversation's title and the line under it, as the web's describe-scope names them. */
internal fun describe(learn: LearnCopy, plan: LearnerPlan, scope: ThreadScope): Pair<String, String> {
    val grade = plan.levelLabel(learn)
    return when (scope) {
        is ThreadScope.Topic -> scope.topic to listOf(plan.subject(scope.subjectSlug)?.name ?: scope.subjectSlug, grade).filter(String::isNotBlank).joinToString(" · ")
        is ThreadScope.Subject -> (plan.subject(scope.subjectSlug)?.name ?: scope.subjectSlug) to listOf(learn.ask.wholeSubject, grade).filter(String::isNotBlank).joinToString(" · ")
        is ThreadScope.General -> learn.ask.anything to ""
    }
}

/** A subject's tile, or the tutor's mark for a question about anything. */
@Composable
internal fun ScopeIcon(plan: LearnerPlan, scope: ThreadScope, size: Dp) {
    val subject = when (scope) {
        is ThreadScope.Topic -> plan.subject(scope.subjectSlug)?.name
        is ThreadScope.Subject -> plan.subject(scope.subjectSlug)?.name
        is ThreadScope.General -> null
    }
    val shape = RoundedCornerShape(GraspyRadius.Card)
    if (subject != null) {
        SubjectBadge(subject, size = size, shape = shape)
    } else {
        Box(Modifier.size(size).background(GraspyColor.AccentSoft, shape), contentAlignment = Alignment.Center) {
            Icon(rememberLucide(Lucide.MessageCircle), contentDescription = null, tint = GraspyColor.Accent, modifier = Modifier.size(size / 2))
        }
    }
}

internal fun placeholderFor(learn: LearnCopy, plan: LearnerPlan, scope: ThreadScope): String = when (scope) {
    is ThreadScope.Topic -> learn.chat.draftPlaceholderTopic.filled("topic" to scope.topic)
    is ThreadScope.Subject -> learn.chat.draftPlaceholderTopic.filled("topic" to (plan.subject(scope.subjectSlug)?.name ?: ""))
    is ThreadScope.General -> learn.ask.anythingPlaceholder
}

private val targetSaver = Saver<ChatTarget?, List<Any>>(
    save = { target ->
        when (target) {
            is ChatTarget.Topic -> listOf("topic", target.subjectSlug, target.topicIndex)
            is ChatTarget.Subject -> listOf("subject", target.subjectSlug)
            ChatTarget.General -> listOf("general")
            null -> emptyList()
        }
    },
    restore = { saved ->
        when (saved.firstOrNull()) {
            "topic" -> ChatTarget.Topic(saved[1] as String, saved[2] as Int)
            "subject" -> ChatTarget.Subject(saved[1] as String)
            "general" -> ChatTarget.General
            else -> null
        }
    },
)
