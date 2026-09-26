package com.latentic.graspy.practice

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.latentic.graspy.collection.recording.VOICE_WAVE_BARS
import com.latentic.graspy.ui.animationsAllowed

private val WAVE_HEIGHT = 44.dp
private val QUIET_BAR = 4.dp
private const val BAR_MS = 90

/**
 * The child's own voice, drawn as it arrives: one bar per tenth of a second of microphone loudness,
 * newest on the right.
 *
 * Bars that move tell a child the phone is hearing them, and a flat line says speak up while there is
 * still time, not after the answer has been sent. Slots not yet filled stay in the quiet colour so the
 * wave keeps its width from the first moment.
 */
@Composable
fun VoiceWave(levels: List<Float>, color: Color, idleColor: Color, modifier: Modifier = Modifier) {
    val motion = animationsAllowed()
    Row(
        modifier = modifier.height(WAVE_HEIGHT),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val offset = VOICE_WAVE_BARS - levels.size
        repeat(VOICE_WAVE_BARS) { slot ->
            val level = levels.getOrNull(slot - offset)
            val height by animateDpAsState(
                targetValue = QUIET_BAR + (WAVE_HEIGHT - QUIET_BAR) * (level ?: 0f),
                animationSpec = if (motion) tween(BAR_MS) else snap(),
                label = "voice bar",
            )
            Box(
                Modifier
                    .size(width = 4.dp, height = height)
                    .background(if (level == null) idleColor else color, RoundedCornerShape(2.dp)),
            )
        }
    }
}
