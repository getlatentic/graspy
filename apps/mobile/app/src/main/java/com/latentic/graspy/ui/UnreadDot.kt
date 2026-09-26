package com.latentic.graspy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp

/** The web's mark for a reply the learner has not seen. */
@Composable
fun UnreadDot(label: String, modifier: Modifier = Modifier, size: Dp = space(2)) {
    Box(
        modifier
            .size(size)
            .background(GraspyColor.Danger, CircleShape)
            .semantics { contentDescription = label },
    )
}
