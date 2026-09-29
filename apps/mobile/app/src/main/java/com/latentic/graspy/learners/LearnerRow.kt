package com.latentic.graspy.learners

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextOverflow
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.withName
import com.latentic.graspy.ui.ForwardChevron
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

/** The smallest a thing to tap is, for a thumb and for a screen reader's touch. */
private val MIN_TARGET = 48.dp

private enum class RowMode { SHOWN, RENAMING, REMOVING }

@Composable
fun LearnerRow(
    copy: AccountCopy,
    learner: LearnerDto,
    inUse: Boolean,
    busy: Boolean,
    onRename: (name: String, onSaved: () -> Unit) -> Unit,
    onRemove: () -> Unit,
    onRecordings: () -> Unit,
) {
    var mode by rememberSaveable(learner.id) { mutableStateOf(RowMode.SHOWN) }
    when (mode) {
        RowMode.RENAMING -> RenameForm(copy, learner.name, busy, { onRename(it) { mode = RowMode.SHOWN } }) { mode = RowMode.SHOWN }
        RowMode.REMOVING -> ConfirmCard(
            question = copy.removeConfirm.withName(learner.name),
            confirm = copy.removeYes,
            cancel = copy.cancel,
            busy = busy,
            onConfirm = onRemove,
            onCancel = { mode = RowMode.SHOWN },
        )
        RowMode.SHOWN -> Shown(copy, learner, inUse, onRecordings, { mode = RowMode.RENAMING }) { mode = RowMode.REMOVING }
    }
}

@Composable
private fun Shown(
    copy: AccountCopy,
    learner: LearnerDto,
    inUse: Boolean,
    onRecordings: () -> Unit,
    onRename: () -> Unit,
    onRemove: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(space(1))) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(space(2))) {
            Column(Modifier.weight(1f)) {
                Text(learner.name, color = GraspyColor.Ink, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (inUse) Text(copy.inUse, color = GraspyColor.Muted, style = MaterialTheme.typography.labelSmall)
            }
            SecondaryButton(copy.rename, onClick = onRename)
            SecondaryButton(copy.remove, onClick = onRemove)
        }
        Row(
            Modifier
                .heightIn(min = MIN_TARGET)
                .clickable(role = Role.Button, onClick = tapping(onRecordings))
                .padding(vertical = space(1)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(copy.recordings.link, color = GraspyColor.AccentInk, style = MaterialTheme.typography.labelLarge)
            ForwardChevron(tint = GraspyColor.AccentInk)
        }
    }
}

@Composable
private fun RenameForm(copy: AccountCopy, name: String, busy: Boolean, onSave: (String) -> Unit, onCancel: () -> Unit) {
    var draft by rememberSaveable { mutableStateOf(name) }
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        LearnerNameField(copy.nameLabel, draft, autoFocus = true) { draft = it }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(space(2))) {
            PrimaryButton(copy.save, onClick = { onSave(draft.trim()) }, enabled = !busy && draft.isNotBlank())
            QuietButton(copy.cancel, onClick = onCancel)
        }
    }
}
