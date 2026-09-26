package com.latentic.graspy.ui

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback

/**
 * Every tap answers with one light tick, so a child knows graspy felt it. The platform constant
 * carries the phone's own haptic setting, so a phone with feedback turned off stays still.
 */
@Composable
fun tapping(action: () -> Unit): () -> Unit {
    val haptics = LocalHapticFeedback.current
    return {
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        action()
    }
}

/** A phone with animations turned off shows the same marks, standing still. */
@Composable
fun animationsAllowed(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
}
