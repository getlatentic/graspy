package com.latentic.graspy.practice

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.animationsAllowed
import com.latentic.graspy.ui.tapping

/** Whose turn it is, and what the teacher is doing about it. */
enum class TeacherMood { TALKING, LISTENING, THINKING, PLEASED, RESTING }

private const val PULSE_MS = 1200
private const val RIPPLE_MS = 1600
private const val NOD_MS = 340

private val FACE_SIZE = 184.dp

/** The portrait keeps its size; the space around it is where her voice is drawn. */
private const val PORTRAIT_SHARE = 0.72f

/**
 * The teacher, as a portrait, so a child who cannot read can see who is talking to them.
 *
 * While she talks, rings spread outward from her and she nods gently. While the child talks her border
 * breathes and the microphone below carries their voice, so there is one halo on the screen, not two.
 */
@Composable
fun TeacherFace(
    mood: TeacherMood,
    teacher: Teacher,
    onTap: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val motion = animationsAllowed()
    val talking = mood == TeacherMood.TALKING && motion
    val listening = mood == TeacherMood.LISTENING && motion

    // Each loop exists only while its state does: a transition that runs with nothing to animate still
    // redraws every frame, which drains a cheap phone and never lets the screen go idle.
    val nod = if (talking) looping(1f, 1.03f, NOD_MS, RepeatMode.Reverse) else 1f
    val ripple = if (talking) looping(0f, 1f, RIPPLE_MS, RepeatMode.Restart) else 0f
    val ringAlpha = if (listening) looping(0.25f, 1f, PULSE_MS, RepeatMode.Reverse) else 1f
    val ring by animateColorAsState(
        targetValue = when (mood) {
            TeacherMood.PLEASED -> Graspy.SuccessDeep
            TeacherMood.THINKING -> Graspy.TextCaption
            else -> Graspy.Brand
        },
        label = "ring",
    )

    Box(
        modifier
            .size(FACE_SIZE)
            .clip(CircleShape)
            .then(if (onTap == null) Modifier else Modifier.clickable(onClick = tapping(onTap)))
            .semantics { contentDescription = teacher.name },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val centre = Offset(size.width / 2, size.height / 2)
            val portraitRadius = size.minDimension * PORTRAIT_SHARE / 2
            val room = size.minDimension / 2 - portraitRadius
            if (talking) drawRipples(ring, centre, portraitRadius, room, ripple)
        }
        Image(
            painter = painterResource(teacher.portrait),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(FACE_SIZE * PORTRAIT_SHARE)
                .graphicsLayer {
                    scaleX = nod
                    scaleY = nod
                }
                .clip(CircleShape)
                .background(Graspy.AccentSurface)
                .border(BorderStroke(3.dp, ring.copy(alpha = ringAlpha)), CircleShape),
        )
    }
}

@Composable
private fun looping(from: Float, to: Float, durationMs: Int, mode: RepeatMode): Float {
    val value by rememberInfiniteTransition(label = "teacher").animateFloat(
        initialValue = from,
        targetValue = to,
        animationSpec = infiniteRepeatable(tween(durationMs), mode),
        label = "teacher loop",
    )
    return value
}

/** Two rings leaving her, half a beat apart, fading as they spread. */
private fun DrawScope.drawRipples(colour: Color, centre: Offset, faceRadius: Float, room: Float, phase: Float) {
    for (offset in listOf(0f, 0.5f)) {
        val progress = (phase + offset) % 1f
        drawCircle(
            colour.copy(alpha = 0.35f * (1f - progress)),
            radius = faceRadius + room * progress,
            center = centre,
            style = Stroke(width = room * 0.08f),
        )
    }
}
