package com.latentic.graspy.practice

import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import com.latentic.graspy.localization.*
import com.latentic.graspy.ui.Graspy

/**
 * What graspy heard, word for word, under the verdict: an adult beside the child can see why an answer
 * was marked the way it was, and a mixed Yoruba-English answer is shown back as it was said.
 */
@Composable
private fun HeardLine(label: String, transcript: String) {
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(color = Graspy.TextCaption, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)) {
                append(label.uppercase())
            }
            append("  ")
            withStyle(SpanStyle(color = Graspy.TextMuted)) { append(transcript) }
        },
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
        maxLines = 3,
        overflow = TextOverflow.Ellipsis,
    )
}

/**
 * One lesson, one screen: what is being memorised, and one short line about it. The board carries
 * both the material and how the last try went, so a marked answer needs no panel of its own.
 */
@Composable
internal fun LessonStage(state: ClassroomState, copy: AppCopy, language: AppLanguage) {
    // Loading and a failed load are told by the button's caption under the board.
    val move = state.move ?: return
    val turn = state.turn
    val outcome = turn?.outcome
    val answeredCorrectly = state.step == ClassroomStep.RESULT && outcome?.decision == PracticeDecision.CORRECT
    (equationFor(turn?.exercise ?: move.exercise, answeredCorrectly) ?: move.showText(language))
        ?.takeIf { state.step != ClassroomStep.REST }
        ?.let {
            // Shrinks rather than wraps: "12 × 12 = 144" stays one line on a small phone.
            BasicText(
                it,
                style = MaterialTheme.typography.displayLarge.copy(color = Graspy.Brand, textAlign = TextAlign.Center),
                maxLines = 1,
                autoSize = TextAutoSize.StepBased(minFontSize = 36.sp, maxFontSize = 64.sp),
            )
        }
    if (state.step == ClassroomStep.RESULT && turn != null) {
        if (state.celebratesAnswer()) CorrectMark(turn.localId, outcome?.feedback.orEmpty())
        Text(
            outcome?.let { feedbackText(copy, turn, it.decision) } ?: unmarkedText(copy.lesson.forTable(turn.table), turn),
            style = MaterialTheme.typography.titleMedium,
            color = if (outcome?.decision == PracticeDecision.CORRECT) Graspy.SuccessDeep else Graspy.TextMuted,
            textAlign = TextAlign.Center,
        )
        outcome?.transcript?.takeIf { it.isNotBlank() }?.let { HeardLine(copy.transcript, it) }
        return
    }
    Text(
        move.text(language),
        style = MaterialTheme.typography.bodyLarge,
        color = Graspy.TextMuted,
        textAlign = TextAlign.Center,
    )
}
