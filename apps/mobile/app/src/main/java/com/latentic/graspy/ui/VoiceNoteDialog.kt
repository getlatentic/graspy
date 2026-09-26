package com.latentic.graspy.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.window.Dialog
import com.latentic.graspy.localization.VoiceNoteCopy

/** The web's VoiceNote: shown once per learner, before their first voice lesson. */
@Composable
fun VoiceNoteDialog(copy: VoiceNoteCopy, onOk: () -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        GraspyCard(Modifier.semantics { paneTitle = copy.title }) {
            Text(copy.note, style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Ink)
            PrimaryButton(copy.ok, onOk)
        }
    }
}
