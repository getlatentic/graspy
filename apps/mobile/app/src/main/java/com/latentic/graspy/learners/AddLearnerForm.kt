package com.latentic.graspy.learners

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardCapitalization
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.space

/** The longest name graspy keeps for a learner. */
const val MAX_LEARNER_NAME = 40

/** Adding a learner asks their name, and that whoever adds them is them or their parent or guardian. */
@Composable
fun AddLearnerForm(copy: AccountCopy, busy: Boolean, onAdd: (String) -> Unit, onCancel: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var guardian by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(space(5))) {
        AccountHeading(copy.addTitle)
        LearnerNameField(copy.nameLabel, name, autoFocus = true) { name = it }
        GuardianCheck(copy.guardian, guardian) { guardian = it }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(space(2)), verticalArrangement = Arrangement.spacedBy(space(2))) {
            PrimaryButton(copy.addButton, onClick = { onAdd(name.trim()) }, enabled = !busy && name.isNotBlank() && guardian)
            QuietButton(copy.cancel, onClick = onCancel, enabled = !busy)
        }
    }
}

@Composable
fun LearnerNameField(label: String, value: String, autoFocus: Boolean, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    val focus = remember { FocusRequester() }
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.take(MAX_LEARNER_NAME)) },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, autoCorrectEnabled = false),
        shape = RoundedCornerShape(GraspyRadius.Control),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = GraspyColor.Accent,
            unfocusedBorderColor = GraspyColor.AccentLine,
            focusedLabelColor = GraspyColor.AccentInk,
            focusedContainerColor = GraspyColor.Surface,
            unfocusedContainerColor = GraspyColor.Surface,
        ),
        modifier = modifier.fillMaxWidth().focusRequester(focus),
    )
    if (autoFocus) LaunchedEffect(Unit) { focus.requestFocus() }
}

@Composable
private fun GuardianCheck(text: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(GraspyColor.AccentSoft, RoundedCornerShape(GraspyRadius.Card))
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange)
            .padding(horizontal = space(2), vertical = space(2)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(1)),
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(checkedColor = GraspyColor.Accent, uncheckedColor = GraspyColor.Faint),
        )
        Text(text, color = GraspyColor.Ink, style = MaterialTheme.typography.bodyMedium)
    }
}
