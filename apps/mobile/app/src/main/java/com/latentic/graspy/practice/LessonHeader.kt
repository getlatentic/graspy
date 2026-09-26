package com.latentic.graspy.practice

import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.tapping
import com.latentic.graspy.ui.space

/**
 * A way out, where she is, and how far to go — one row, and the only adult chrome on the screen.
 *
 * The teacher's name is not written here because her face is directly below it, and the lesson's
 * name is not either: a child who cannot read is told what this is by the teacher speaking. What is
 * left is what a child genuinely uses, which is knowing the end is coming.
 */
@Composable
internal fun LessonHeader(state: ClassroomState, onBack: (() -> Unit)?) {
    val items = state.move?.let { move ->
        boardItems(state.turn?.exercise ?: move.exercise ?: return@let emptyList(), move, state.turn?.outcome)
    }.orEmpty()
    Row(
        Modifier.fillMaxWidth().padding(start = space(2.5), end = space(5), top = space(1.5), bottom = space(1.5)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(3)),
    ) {
        if (onBack != null) {
            IconButton(onClick = tapping(onBack)) {
                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, contentDescription = null, tint = GraspyColor.Accent)
            }
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(space(1))) {
            items.forEach { item ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(6.dp)
                        .background(tickColour(item.state), RoundedCornerShape(GraspyRadius.Pill)),
                )
            }
        }
        if (items.isNotEmpty()) {
            Text(
                "${items.count { it.state != ItemState.NOT_YET }} / ${items.size}",
                style = MaterialTheme.typography.labelMedium,
                color = GraspyColor.Muted,
            )
        }
    }
}

private fun tickColour(state: ItemState) = when (state) {
    ItemState.SAID -> GraspyColor.Success
    ItemState.WRONG, ItemState.UNSURE -> GraspyColor.Warning
    ItemState.NOT_YET -> GraspyColor.Line
}
