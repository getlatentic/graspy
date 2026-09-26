package com.latentic.graspy.learners

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space

/** Asks before something that cannot be undone. */
@Composable
fun ConfirmCard(question: String, confirm: String, cancel: String, busy: Boolean, onConfirm: () -> Unit, onCancel: () -> Unit) {
    val shape = RoundedCornerShape(GraspyRadius.Card)
    Column(
        Modifier
            .fillMaxWidth()
            .background(GraspyColor.Surface, shape)
            .border(BorderStroke(1.dp, GraspyColor.Danger), shape)
            .padding(space(4))
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(space(3)),
    ) {
        Text(question, color = GraspyColor.Ink, style = MaterialTheme.typography.bodyMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(space(2)), verticalArrangement = Arrangement.spacedBy(space(2))) {
            PrimaryButton(confirm, onClick = onConfirm, enabled = !busy)
            SecondaryButton(cancel, onClick = onCancel, enabled = !busy)
        }
    }
}
