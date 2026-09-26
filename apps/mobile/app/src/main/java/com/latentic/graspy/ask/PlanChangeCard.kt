package com.latentic.graspy.ask

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.latentic.graspy.localization.ChatCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.LearningPath
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.space

// The rest is one line, so the composer stays on a phone's screen.
private const val PREVIEWED_STEPS = 4

/** A change waiting for the learner, in the web's words (features/learn/components/plan-change-card.tsx). */
@Composable
internal fun PlanChangeCard(words: ChatCopy, change: PendingChange, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    when (change) {
        is PendingChange.Path -> PathProposal(words, change, onConfirm, onDismiss)
        else -> Frame(words.confirmTitle, GraspyColor.WarningLine, GraspyColor.WarningSoft) {
            val text = if (change is PendingChange.ChangeSubjects) words.confirmRemove.filled("subjects" to change.removed.joinToString(", ")) else words.confirmRebuild
            Text(text, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Ink)
            Choices(words.confirmYes, words.confirmNo, onConfirm, onDismiss)
        }
    }
}

@Composable
private fun PathProposal(words: ChatCopy, change: PendingChange.Path, onAccept: () -> Unit, onDismiss: () -> Unit) {
    Frame(words.pathTitle, GraspyColor.AccentLine, GraspyColor.AccentSoft) {
        val path = change.path
        when {
            change.failed -> {
                Text(words.pathFailed.filled("goal" to change.goal), style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Ink)
                QuietButton(words.pathNotNow, onDismiss)
            }
            path == null -> Text(words.pathPlanning.filled("goal" to change.goal), style = MaterialTheme.typography.bodyMedium, color = GraspyColor.AccentInk)
            else -> {
                PathPreview(words, path)
                Choices(words.pathAccept, words.pathNotNow, onAccept, onDismiss)
            }
        }
    }
}

@Composable
private fun PathPreview(words: ChatCopy, path: LearningPath) {
    Text(path.subject, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = GraspyColor.Ink)
    Text(pathSummary(words, path), style = MaterialTheme.typography.bodySmall, color = GraspyColor.Muted)
    path.steps.take(PREVIEWED_STEPS).forEachIndexed { index, step ->
        Text("${index + 1}. ${step.title} · ${step.level}", style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Ink)
    }
    val more = path.steps.size - PREVIEWED_STEPS
    if (more > 0) Text(words.pathMore.filled("count" to more), style = MaterialTheme.typography.bodySmall, color = GraspyColor.Muted)
}

internal fun pathSummary(words: ChatCopy, path: LearningPath): String {
    val from = path.steps.firstOrNull()?.level.orEmpty()
    val to = path.steps.lastOrNull()?.level.orEmpty()
    val count = path.steps.size
    return if (from == to) words.pathSummaryOneLevel.filled("count" to count, "level" to from) else words.pathSummary.filled("count" to count, "from" to from, "to" to to)
}

@Composable
private fun Choices(yes: String, no: String, onYes: () -> Unit, onNo: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(space(2))) {
        PrimaryButton(yes, onYes)
        QuietButton(no, onNo)
    }
}

@Composable
private fun Frame(title: String, line: Color, ground: Color, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(GraspyRadius.Control)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = space(3), vertical = space(1))
            .background(ground, shape)
            .border(1.dp, line, shape)
            .padding(space(3))
            .semantics { paneTitle = title },
        verticalArrangement = Arrangement.spacedBy(space(2)),
    ) { content() }
}
