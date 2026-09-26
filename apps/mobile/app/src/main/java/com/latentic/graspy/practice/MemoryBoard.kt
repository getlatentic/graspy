package com.latentic.graspy.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.tapping

/** How the learner's last try went on one thing they are memorising. */
enum class ItemState { NOT_YET, SAID, WRONG, UNSURE }

/** One thing to say from memory, and how the last try went. */
data class BoardItem(val label: String, val state: ItemState)

/**
 * The things this step asks the learner to say, in the order they are said. The board is both the
 * thing being memorised and the record of how it went, so a result needs no panel of its own.
 */
fun boardItems(exercise: PracticeExercise, move: LessonMove?, outcome: PracticeOutcome?): List<BoardItem> =
    when (exercise) {
        is PracticeExercise.TimesTableRecitation -> tableItems(exercise, outcome?.recitation)
        is PracticeExercise.FactAnswer -> listOf(
            BoardItem("${exercise.table} × ${exercise.multiplier}", answerState(outcome)),
        )
        is PracticeExercise.Planned -> sequenceItems(move, outcome?.sequence)
        else -> emptyList()
    }

private fun tableItems(exercise: PracticeExercise.TimesTableRecitation, result: RecitationResult?): List<BoardItem> =
    exercise.multipliers.map { multiplier ->
        BoardItem(
            label = "${exercise.table} × $multiplier",
            state = when {
                result == null -> ItemState.NOT_YET
                multiplier in result.correctMultipliers -> ItemState.SAID
                result.incorrectFacts.any { it.multiplier == multiplier } -> ItemState.WRONG
                multiplier in result.uncertainMultipliers -> ItemState.UNSURE
                else -> ItemState.NOT_YET
            },
        )
    }

private fun sequenceItems(move: LessonMove?, result: SequenceResult?): List<BoardItem> =
    move?.activity?.items.orEmpty().map { item ->
        BoardItem(
            label = item.spoken,
            state = when {
                result == null -> ItemState.NOT_YET
                item.id in result.outOfOrder -> ItemState.WRONG
                item.id in result.said -> ItemState.SAID
                else -> ItemState.NOT_YET
            },
        )
    }

private fun answerState(outcome: PracticeOutcome?): ItemState = when (outcome?.decision) {
    null -> ItemState.NOT_YET
    PracticeDecision.CORRECT -> ItemState.SAID
    PracticeDecision.TRY_AGAIN -> ItemState.WRONG
    else -> ItemState.UNSURE
}

private fun chipColours(state: ItemState): Pair<Color, Color> = when (state) {
    ItemState.SAID -> Graspy.SuccessSurface to Graspy.SuccessText
    ItemState.WRONG -> Graspy.DangerSurface to Graspy.Danger
    ItemState.UNSURE -> Graspy.WarningSurface to Graspy.WarningText
    ItemState.NOT_YET -> Graspy.Surface to Graspy.TextMuted
}

/** Everything to be said, always on screen: what to learn, and what is already known. */
@Composable
fun MemoryBoard(items: List<BoardItem>, modifier: Modifier = Modifier) {
    if (items.isEmpty()) return
    FlowRow(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items.forEach { item ->
            val (background, text) = chipColours(item.state)
            Text(
                item.label,
                color = text,
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .background(background, RoundedCornerShape(14.dp))
                    .border(1.dp, Graspy.Hairline, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
    }
}

/**
 * The teacher, as one thing to tap. Audio is the lesson, so it is a target the size of a child's
 * thumb rather than a line of text under a heading.
 */
@Composable
fun TeacherSpeakerButton(
    state: TeacherVoiceState,
    label: String,
    /** Whether hearing the teacher is the thing to do now, rather than help with it. */
    leading: Boolean,
    onListen: () -> Unit,
) {
    // One filled control at a time. Until the child has heard the question, playing it is the whole
    // job and this is filled; afterwards the foot of the screen carries the lesson on and this steps
    // back to tonal. It never disappears, because a child who cannot read has no other way back in.
    val speaking = state == TeacherVoiceState.SPEAKING
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
    Box(
        Modifier
            .size(96.dp)
            .background(if (leading) Graspy.Brand else Graspy.AccentSurface, CircleShape)
            .border(if (speaking) 3.dp else 2.dp, Graspy.AccentBorder, CircleShape)
            .clip(CircleShape)
            .clickable(enabled = state != TeacherVoiceState.BUFFERING, onClick = tapping(onListen)),
        contentAlignment = Alignment.Center,
    ) {
        if (state == TeacherVoiceState.BUFFERING) {
            CircularProgressIndicator(
                color = if (leading) Graspy.OnAction else Graspy.Brand,
                strokeWidth = 3.dp,
            )
        } else {
            Icon(
                Icons.Rounded.VolumeUp,
                contentDescription = null,
                tint = if (leading) Graspy.OnAction else Graspy.Brand,
                modifier = Modifier.size(44.dp),
            )
        }
    }
        Text(label, color = Graspy.TextMuted, style = MaterialTheme.typography.labelLarge)
    }
}
