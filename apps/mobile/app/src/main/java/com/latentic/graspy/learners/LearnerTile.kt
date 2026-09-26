package com.latentic.graspy.learners

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.tapping
import com.latentic.graspy.ui.space

/** A learner's face on "Who's learning?": the first letter of their name. */
internal fun initialOf(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return "?"
    return trimmed.substring(0, trimmed.offsetByCodePoints(0, 1)).uppercase()
}

@Composable
fun LearnerTile(learner: LearnerDto, inUse: Boolean, inUseNote: String, enabled: Boolean, onChoose: () -> Unit) {
    Tile(label = learner.name, note = inUseNote.takeIf { inUse }, enabled = enabled, onClick = onChoose) {
        Box(
            Modifier
                .size(80.dp)
                .background(GraspyColor.AccentSoft, CircleShape)
                .border(2.dp, if (inUse) GraspyColor.Accent else GraspyColor.AccentSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(initialOf(learner.name), color = GraspyColor.AccentInk, style = MaterialTheme.typography.headlineLarge)
        }
    }
}

@Composable
fun AddLearnerTile(label: String, enabled: Boolean, onAdd: () -> Unit) {
    Tile(label = label, note = null, enabled = enabled, onClick = onAdd) {
        Box(
            Modifier.size(80.dp).drawBehind {
                drawCircle(
                    color = GraspyColor.AccentLine,
                    radius = size.minDimension / 2 - 1.dp.toPx(),
                    style = Stroke(width = 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 10f))),
                )
            },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Rounded.Add, contentDescription = null, tint = GraspyColor.AccentInk, modifier = Modifier.size(32.dp))
        }
    }
}

@Composable
private fun Tile(label: String, note: String?, enabled: Boolean, onClick: () -> Unit, face: @Composable () -> Unit) {
    val shape = RoundedCornerShape(GraspyRadius.Card)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .clickable(enabled = enabled, onClick = tapping(onClick))
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .padding(space(3)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(space(2.5)),
    ) {
        face()
        Text(
            label,
            color = GraspyColor.Ink,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        note?.let { Text(it, color = GraspyColor.AccentInk, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center) }
    }
}

private const val DISABLED_ALPHA = 0.6f
