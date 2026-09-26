package com.latentic.graspy.practice

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.geometry.Offset
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.animationsAllowed

/**
 * A right answer is marked. A missed one never is: the teacher already explains it kindly, and a
 * buzz or a red flash would only shame a child for trying.
 */
fun ClassroomState.celebratesAnswer(): Boolean =
    step == ClassroomStep.RESULT && turn?.outcome?.decision == PracticeDecision.CORRECT

/**
 * The mark a right answer earns: one short haptic and the teacher's tick growing into place, once
 * per result. It sits beside the result and never delays the next step.
 */
@Composable
fun CorrectMark(turnId: String, label: String) {
    val haptics = LocalHapticFeedback.current
    val animated = animationsAllowed()
    val pop = remember(turnId) { Animatable(if (animated) 0f else 1f) }
    LaunchedEffect(turnId) {
        haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        if (animated) pop.animateTo(1f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessMediumLow))
    }
    val burst = remember(turnId) { Animatable(0f) }
    LaunchedEffect(turnId) { if (animated) burst.animateTo(1f, tween(BURST_MS, easing = LinearOutSlowInEasing)) }
    Box(Modifier.size(BURST_SIZE), contentAlignment = Alignment.Center) {
        // A short burst of brand-coloured dots from the tick: the moment a right answer lands.
        if (animated && burst.value < 1f) {
            Canvas(Modifier.fillMaxSize()) {
                val travel = size.minDimension / 2 * (0.35f + 0.65f * burst.value)
                val fade = 1f - burst.value
                repeat(BURST_DOTS) { index ->
                    val angle = (index * 2 * PI / BURST_DOTS).toFloat()
                    drawCircle(
                        color = BURST_COLOURS[index % BURST_COLOURS.size].copy(alpha = fade),
                        radius = 5.dp.toPx() * (0.6f + 0.4f * fade),
                        center = center + Offset(cos(angle) * travel, sin(angle) * travel),
                    )
                }
            }
        }
        Box(
            Modifier
                .size(88.dp)
                .scale(0.7f + 0.3f * pop.value)
                .alpha((1f - pop.value).coerceIn(0f, 1f))
                .border(2.dp, GraspyColor.Success, CircleShape),
        )
        Box(
            Modifier.size(64.dp).scale(pop.value).background(GraspyColor.Success, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Rounded.Check, contentDescription = label, tint = GraspyColor.OnAccent, modifier = Modifier.size(36.dp))
        }
    }
}

private const val BURST_MS = 700
private const val BURST_DOTS = 12
private val BURST_SIZE = 150.dp
private val BURST_COLOURS = listOf(GraspyColor.Accent, GraspyColor.Success, GraspyColor.AccentLine)
