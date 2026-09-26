package com.latentic.graspy.practice

import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.tapping
import com.latentic.graspy.ui.space

/** Whose turn it is, named once under her portrait with the sign for it: her voice, or the child's. */
@Composable
internal fun StatusPill(label: String, icon: ImageVector) {
    Row(
        Modifier
            .background(GraspyColor.AccentSoft, RoundedCornerShape(GraspyRadius.Pill))
            .padding(horizontal = space(4), vertical = space(2)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(2)),
    ) {
        Icon(icon, contentDescription = null, tint = GraspyColor.AccentInk, modifier = Modifier.size(20.dp))
        Text(label, style = MaterialTheme.typography.titleMedium, color = GraspyColor.AccentInk, maxLines = 1)
    }
}

private val BUTTON_SIZE = 88.dp
internal val BUTTON_HALO = 132.dp

/**
 * The one button on the lesson screen. It stays in one place at one size for the whole lesson; the turn
 * changes only what is drawn in it, so nothing on the screen moves when her line ends or the child starts.
 *
 * While the microphone is open it also shows the child's voice: a halo that reaches further the louder
 * they speak. Waiting is a spinner inside the same circle rather than the circle going away.
 */
@Composable
internal fun RoundTurnButton(button: TurnButton, level: Float, description: String, motionMs: Int, onTap: () -> Unit) {
    val reach by animateFloatAsState(
        targetValue = if (button == TurnButton.FINISH) level.coerceIn(0f, 1f) else 0f,
        animationSpec = tween(100),
        label = "voice halo",
    )
    val container by animateColorAsState(containerOf(button), tween(motionMs), label = "button colour")
    val content by animateColorAsState(contentOf(button), tween(motionMs), label = "icon colour")
    Box(Modifier.size(BUTTON_HALO), contentAlignment = Alignment.Center) {
        if (button == TurnButton.FINISH) {
            Canvas(Modifier.fillMaxSize()) {
                val core = BUTTON_SIZE.toPx() / 2
                val room = size.minDimension / 2 - core
                drawCircle(GraspyColor.AccentLine, radius = core + room * (0.35f + 0.65f * reach))
                drawCircle(GraspyColor.AccentSoft, radius = core + room * 0.3f * (0.5f + reach))
            }
        }
        FilledIconButton(
            onClick = tapping(onTap),
            enabled = button != TurnButton.WAIT,
            // The same ring in every state, so a pale circle reads as the same size as a lit one.
            modifier = Modifier
                .size(BUTTON_SIZE)
                .border(2.dp, GraspyColor.AccentLine, CircleShape)
                .semantics { contentDescription = description },
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = container,
                contentColor = content,
                disabledContainerColor = container,
                disabledContentColor = content,
            ),
        ) {
            Crossfade(targetState = button, animationSpec = tween(motionMs), label = "button icon") { shown ->
                when (shown) {
                    TurnButton.WAIT -> CircularProgressIndicator(Modifier.size(34.dp), color = content, strokeWidth = 3.dp)
                    else -> Icon(iconOf(shown), contentDescription = null, modifier = Modifier.size(40.dp))
                }
            }
        }
    }
}

private fun iconOf(button: TurnButton): ImageVector = when (button) {
    TurnButton.STOP_TEACHER, TurnButton.HEAR_AGAIN -> Icons.AutoMirrored.Rounded.VolumeUp
    TurnButton.RECORD, TurnButton.FINISH, TurnButton.WAIT -> Icons.Rounded.Mic
    TurnButton.RETRY -> Icons.Rounded.Refresh
}

/** Lit while she talks and on the child's turn; pale while she is quiet, while waiting, and to ask again. */
private fun containerOf(button: TurnButton): Color = when (button) {
    TurnButton.STOP_TEACHER -> GraspyColor.Accent
    TurnButton.RECORD, TurnButton.FINISH -> GraspyColor.Accent
    TurnButton.HEAR_AGAIN, TurnButton.WAIT, TurnButton.RETRY -> GraspyColor.AccentSoft
}

private fun contentOf(button: TurnButton): Color = when (button) {
    TurnButton.STOP_TEACHER, TurnButton.RECORD, TurnButton.FINISH -> GraspyColor.OnAccent
    TurnButton.HEAR_AGAIN, TurnButton.WAIT, TurnButton.RETRY -> GraspyColor.Accent
}
