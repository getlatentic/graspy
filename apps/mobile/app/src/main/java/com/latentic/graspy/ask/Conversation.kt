package com.latentic.graspy.ask

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.mcp.AppView
import com.latentic.graspy.mcp.ViewServer
import com.latentic.graspy.mcp.ViewEvents
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PillButton
import com.latentic.graspy.ui.icons.Lucide
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

@Composable
internal fun Conversation(
    learn: LearnCopy,
    locale: String,
    server: ViewServer,
    ask: AskViewModel,
    scope: ThreadScope,
    context: TurnContext,
    onLink: (LinkTarget) -> Unit,
    modifier: Modifier,
) {
    val (threadId, messages) = ask.messages.collectAsStateWithLifecycle().value
    val turn by ask.turnState.collectAsStateWithLifecycle()
    val answering = turn.busyThreadId != null && (turn.busyThreadId == threadId || threadId == null)
    val send = { text: String -> ask.send(text, scope, context) }
    Column(modifier) {
        ChatLog(learn, locale, server, ask, scope, messages, turn, answering, send, onLink, Modifier.weight(1f))
        turn.pending?.takeIf { turn.pendingThreadId == null || turn.pendingThreadId == threadId }?.let { change ->
            PlanChangeCard(learn.chat, change, onConfirm = { ask.confirmPlanChange(context) }, onDismiss = ask::dismissPlanChange)
        }
        val last = messages.lastOrNull()
        if (!answering && last?.kind == MessageKind.TUTOR && last.metadata.followUps.isNotEmpty()) FollowUps(last.metadata.followUps, send)
        Composer(learn, context.plan.plan, scope, answering, send, ask::stop)
    }
}

@Composable
private fun ChatLog(
    learn: LearnCopy,
    locale: String,
    server: ViewServer,
    ask: AskViewModel,
    scope: ThreadScope,
    messages: List<ChatMessage>,
    turn: TurnState,
    answering: Boolean,
    send: (String) -> Boolean,
    onLink: (LinkTarget) -> Unit,
    modifier: Modifier,
) {
    val list = rememberLazyListState()
    LaunchedEffect(messages.size, answering, turn.streaming.isEmpty()) {
        list.animateScrollToItem(list.layoutInfo.totalItemsCount.coerceAtLeast(1) - 1)
    }
    val welcome = if (scope is ThreadScope.General) learn.ask.anythingWelcome else learn.chat.aiTutorWelcome
    LazyColumn(
        modifier.fillMaxWidth(),
        state = list,
        contentPadding = PaddingValues(horizontal = space(4), vertical = space(4)),
        verticalArrangement = Arrangement.spacedBy(space(5)),
    ) {
        item { TutorSays(learn) { PlainReply(welcome) } }
        items(messages, key = ChatMessage::id) { message ->
            MessageItem(learn, locale, server, message, onLink, ViewEvents(toolCalled = { name, arguments, _ -> ask.viewCalled(name, arguments) }, message = send))
        }
        if (answering) {
            item(key = "answering") {
                TutorSays(learn) {
                    val waiting = turn.activity?.let(learn.chat.activity::get) ?: learn.chat.tutorThinking
                    PlainReply(turn.streaming.ifEmpty { waiting }, quiet = turn.streaming.isEmpty())
                }
            }
        }
        if (turn.changingPlan) item(key = "changing") { Text(learn.chat.changingPlan, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted) }
    }
}

@Composable
private fun MessageItem(learn: LearnCopy, locale: String, server: ViewServer, message: ChatMessage, onLink: (LinkTarget) -> Unit, events: ViewEvents) {
    when (message.kind) {
        MessageKind.LEARNER -> LearnerSays(message.content)
        MessageKind.TUTOR -> Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
            TutorSays(learn) { ReplyView(message.content) { PlainReply(message.content) } }
            message.metadata.card?.let { AppView(it, server, locale, learn.chat.viewUnavailable, events = events) }
        }
        MessageKind.DONE -> AppNote(message.content, message.metadata.link, onLink)
        MessageKind.FAILED -> Row(horizontalArrangement = Arrangement.spacedBy(space(2))) {
            Text(message.content, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Danger)
        }
    }
}

@Composable
private fun TutorSays(learn: LearnCopy, reply: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        Text(learn.chat.aiTutorTitle, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = GraspyColor.Muted)
        reply()
    }
}

@Composable
private fun PlainReply(text: String, quiet: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.bodyLarge.copy(lineHeight = MaterialTheme.typography.bodyLarge.fontSize * 1.75f),
        color = if (quiet) GraspyColor.Muted else GraspyColor.Ink,
    )
}

@Composable
private fun LearnerSays(text: String) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Text(
            text,
            style = MaterialTheme.typography.bodyLarge,
            color = GraspyColor.Ink,
            modifier = Modifier
                .widthIn(max = space(72))
                .background(GraspyColor.AccentSoft, RoundedCornerShape(topStart = space(4), topEnd = space(4), bottomStart = space(4), bottomEnd = space(1.5)))
                .padding(horizontal = space(4), vertical = space(2.5)),
        )
    }
}

/** What the app did, in its own words, with a link to where it shows; the conversation never leaves on its own. */
@Composable
private fun AppNote(text: String, link: ChatLink?, onLink: (LinkTarget) -> Unit) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(space(2))) {
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = GraspyColor.Success,
            modifier = Modifier.background(GraspyColor.SuccessSoft, RoundedCornerShape(GraspyRadius.Pill)).padding(horizontal = space(3), vertical = space(1)),
        )
        link?.let { PillButton(it.label) { onLink(it.to) } }
    }
}

@Composable
private fun FollowUps(followUps: List<String>, ask: (String) -> Boolean) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = space(4), vertical = space(1)),
        horizontalArrangement = Arrangement.spacedBy(space(2)),
    ) {
        followUps.forEach { question ->
            Text(
                question,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = GraspyColor.AccentInk,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .widthIn(max = space(64))
                    .clip(RoundedCornerShape(GraspyRadius.Pill))
                    .border(1.dp, GraspyColor.Line, RoundedCornerShape(GraspyRadius.Pill))
                    .background(GraspyColor.Surface)
                    .clickable(onClick = tapping { ask(question) })
                    .padding(horizontal = space(3), vertical = space(1.5)),
            )
        }
    }
}

@Composable
private fun Composer(learn: LearnCopy, plan: LearnerPlan?, scope: ThreadScope, answering: Boolean, send: (String) -> Boolean, stop: () -> Unit) {
    var draft by rememberSaveable(scope.key) { mutableStateOf("") }
    val placeholder = plan?.let { placeholderFor(learn, it, scope) } ?: learn.chat.openTutor
    val shape = RoundedCornerShape(space(4))
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = space(3), vertical = space(2))
            .background(GraspyColor.Surface, shape)
            .border(1.dp, GraspyColor.Line, shape)
            .padding(start = space(4), end = space(1.5), top = space(1.5), bottom = space(1.5)),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(space(2)),
    ) {
        Box(Modifier.weight(1f).heightIn(min = space(9)).padding(vertical = space(1.5)), contentAlignment = Alignment.CenterStart) {
            if (draft.isEmpty()) Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            BasicTextField(
                value = draft,
                onValueChange = { draft = it.take(TutorClient.MAX_MESSAGE) },
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = GraspyColor.Ink),
                cursorBrush = SolidColor(GraspyColor.Accent),
                maxLines = 6,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = placeholder },
            )
        }
        if (answering) {
            RoundButton(Lucide.Square, learn.chat.stop, GraspyColor.Ink, stop)
        } else {
            RoundButton(Lucide.ArrowUp, learn.chat.send, if (draft.isBlank()) GraspyColor.Track else GraspyColor.Accent) {
                if (send(draft)) draft = ""
            }
        }
    }
}

@Composable
private fun RoundButton(icon: Lucide, label: String, fill: Color, onClick: () -> Unit) {
    Box(
        Modifier.size(space(9)).clip(CircleShape).background(fill).clickable(onClick = tapping(onClick)).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(rememberLucide(icon), contentDescription = null, tint = if (fill == GraspyColor.Track) GraspyColor.Muted else GraspyColor.Surface, modifier = Modifier.size(space(4)))
    }
}
