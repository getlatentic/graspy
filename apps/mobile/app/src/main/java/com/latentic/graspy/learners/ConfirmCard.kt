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
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.SecondaryButton

/** Asks before something that cannot be undone. */
@Composable
fun ConfirmCard(question: String, confirm: String, cancel: String, busy: Boolean, onConfirm: () -> Unit, onCancel: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .background(Graspy.Surface, shape)
            .border(BorderStroke(1.dp, Graspy.Danger), shape)
            .padding(16.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(question, color = Graspy.Text, style = MaterialTheme.typography.bodyMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryButton(confirm, onClick = onConfirm, enabled = !busy)
            SecondaryButton(cancel, onClick = onCancel, enabled = !busy)
        }
    }
}
