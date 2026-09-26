package com.latentic.graspy.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

private val ButtonShape = RoundedCornerShape(GraspyRadius.Control)

/** The one thing a screen asks for. */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = tapping(onClick),
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = ButtonShape,
        colors = ButtonDefaults.buttonColors(
            containerColor = GraspyColor.Accent,
            contentColor = GraspyColor.OnAccent,
            disabledContainerColor = GraspyColor.AccentLine,
            disabledContentColor = GraspyColor.OnAccent,
        ),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

/** The web's small round button, as on the card that continues a topic. */
@Composable
fun PillButton(text: String, onClick: () -> Unit) {
    Button(
        onClick = tapping(onClick),
        shape = RoundedCornerShape(GraspyRadius.Pill),
        contentPadding = PaddingValues(horizontal = space(4), vertical = space(2)),
        colors = ButtonDefaults.buttonColors(containerColor = GraspyColor.Accent, contentColor = GraspyColor.OnAccent),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(
        onClick = tapping(onClick),
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = ButtonShape,
        border = BorderStroke(1.dp, GraspyColor.Line),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = GraspyColor.Surface, contentColor = GraspyColor.Ink),
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
fun QuietButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    TextButton(onClick = tapping(onClick), enabled = enabled, modifier = modifier.heightIn(min = 48.dp)) {
        Text(text, color = GraspyColor.AccentInk, style = MaterialTheme.typography.labelLarge)
    }
}

/** What went wrong, read out as soon as it appears. */
@Composable
fun ProblemNote(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        color = GraspyColor.Danger,
        style = MaterialTheme.typography.labelLarge,
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
    )
}
