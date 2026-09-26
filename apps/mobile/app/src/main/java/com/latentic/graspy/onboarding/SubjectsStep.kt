package com.latentic.graspy.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.latentic.graspy.localization.PlanOnboardingSubjectsCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.GeneratedSubject
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space

/** The subjects taught at the learner's level, the recommended ones chosen, up to the limit. */
@Composable
fun SubjectsStep(words: PlanOnboardingSubjectsCopy, choices: SubjectChoices, onToggle: (String) -> Unit, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
        Text(words.heading.uppercase(), style = MaterialTheme.typography.labelMedium, color = GraspyColor.Muted)
        if (choices.chosen.size >= SUBJECT_SELECTION_LIMIT) {
            Text(
                words.limit.filled("limit" to SUBJECT_SELECTION_LIMIT),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = GraspyColor.AccentInk,
                modifier = Modifier.fillMaxWidth().background(GraspyColor.AccentSoft, RoundedCornerShape(GraspyRadius.Control)).padding(horizontal = space(3), vertical = space(2)),
            )
        }
        when {
            choices.failed -> {
                Text(words.loadFailed, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Danger)
                SecondaryButton(words.tryAgain, onRetry)
            }
            choices.available.isEmpty() -> Text(words.finding, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
            else -> choices.available.forEach { subject -> SubjectRow(words, subject, subject.id in choices.chosen) { onToggle(subject.id) } }
        }
        if (choices.loading && choices.available.isNotEmpty()) Text(words.finding, style = MaterialTheme.typography.bodySmall, color = GraspyColor.Muted)
    }
}

@Composable
private fun SubjectRow(words: PlanOnboardingSubjectsCopy, subject: GeneratedSubject, chosen: Boolean, onToggle: () -> Unit) {
    val shape = RoundedCornerShape(GraspyRadius.Card)
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (chosen) GraspyColor.AccentSoft else GraspyColor.Surface, shape)
            .border(1.dp, if (chosen) GraspyColor.AccentLine else GraspyColor.Line, shape)
            .toggleable(value = chosen, role = Role.Checkbox, onValueChange = { onToggle() })
            .padding(horizontal = space(2), vertical = space(1)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(chosen, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = GraspyColor.Accent, uncheckedColor = GraspyColor.Faint), modifier = Modifier.size(space(10)))
        Text(subject.label, style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Ink, modifier = Modifier.weight(1f))
        if (subject.recommended) {
            Text(words.recommended, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = GraspyColor.AccentInk, modifier = Modifier.padding(end = space(2)))
        }
    }
}
