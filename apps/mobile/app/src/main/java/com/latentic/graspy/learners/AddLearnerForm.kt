package com.latentic.graspy.learners

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.KeyboardCapitalization
import com.latentic.graspy.consent.ConsentNotice
import com.latentic.graspy.consent.SERVICE_NOTICE
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.space

/** The longest name graspy keeps for a learner. */
const val MAX_LEARNER_NAME = 40

/**
 * Adding a learner asks their name, and the parent's agreement to graspy teaching them: the notice, and signing in
 * with Google again. [onAgree] adds the learner with that agreement.
 */
@Composable
fun AddLearnerForm(copy: AccountCopy, busy: Boolean, onAgree: (name: String) -> Unit, onCancel: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(space(5))) {
        AccountHeading(copy.addTitle)
        LearnerNameField(copy.nameLabel, name, autoFocus = true) { name = it }
        ConsentNotice(
            copy = copy,
            notice = SERVICE_NOTICE,
            busy = busy,
            onAgree = { onAgree(name.trim()) },
            onCancel = onCancel,
            canAgree = name.isNotBlank(),
        )
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
