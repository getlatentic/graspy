package com.latentic.graspy.learners

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.withName
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.SecondaryButton

private enum class RowMode { SHOWN, RENAMING, REMOVING }

@Composable
fun LearnerRow(
    copy: AccountCopy,
    learner: LearnerDto,
    inUse: Boolean,
    busy: Boolean,
    onRename: (name: String, onSaved: () -> Unit) -> Unit,
    onRemove: () -> Unit,
) {
    var mode by rememberSaveable(learner.id) { mutableStateOf(RowMode.SHOWN) }
    when (mode) {
        RowMode.RENAMING -> RenameForm(copy, learner.name, busy, { onRename(it) { mode = RowMode.SHOWN } }) { mode = RowMode.SHOWN }
        RowMode.REMOVING -> ConfirmCard(
            question = copy.removeConfirm.withName(learner.name),
            confirm = copy.removeYes.withName(learner.name),
            cancel = copy.cancel,
            busy = busy,
            onConfirm = onRemove,
            onCancel = { mode = RowMode.SHOWN },
        )
        RowMode.SHOWN -> Shown(copy, learner, inUse, { mode = RowMode.RENAMING }) { mode = RowMode.REMOVING }
    }
}

@Composable
private fun Shown(copy: AccountCopy, learner: LearnerDto, inUse: Boolean, onRename: () -> Unit, onRemove: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            Text(learner.name, color = Graspy.Text, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (inUse) Text(copy.inUse, color = Graspy.TextMuted, style = MaterialTheme.typography.labelSmall)
        }
        SecondaryButton(copy.rename, onClick = onRename)
        SecondaryButton(copy.remove, onClick = onRemove)
    }
}

@Composable
private fun RenameForm(copy: AccountCopy, name: String, busy: Boolean, onSave: (String) -> Unit, onCancel: () -> Unit) {
    var draft by rememberSaveable { mutableStateOf(name) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LearnerNameField(copy.nameLabel, draft, autoFocus = true) { draft = it }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryButton(copy.save, onClick = { onSave(draft.trim()) }, enabled = !busy && draft.isNotBlank())
            QuietButton(copy.cancel, onClick = onCancel)
        }
    }
}
