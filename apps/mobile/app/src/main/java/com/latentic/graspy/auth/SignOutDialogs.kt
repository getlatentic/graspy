package com.latentic.graspy.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.SecondaryButton

/** While signing out, and when signing out now would lose what has not reached graspy. */
@Composable
fun SignOutDialogs(copy: AccountCopy, state: SignOutState, onAnyway: () -> Unit, onCancel: () -> Unit) {
    when {
        state.unsent -> AlertDialog(
            onDismissRequest = onCancel,
            text = { Text(copy.signOutUnsent, color = Graspy.Danger, style = MaterialTheme.typography.bodyLarge) },
            confirmButton = { PrimaryButton(copy.signOutAnyway, onClick = onAnyway) },
            dismissButton = { SecondaryButton(copy.cancel, onClick = onCancel) },
            containerColor = Graspy.Surface,
        )
        state.busy -> AlertDialog(
            onDismissRequest = {},
            properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
            text = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CircularProgressIndicator(color = Graspy.Brand, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    Text(copy.signingOut, color = Graspy.Text, style = MaterialTheme.typography.bodyLarge)
                }
            },
            confirmButton = {},
            containerColor = Graspy.Surface,
        )
    }
}
