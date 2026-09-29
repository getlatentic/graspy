package com.latentic.graspy.recordings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.latentic.graspy.consent.ConsentNotice
import com.latentic.graspy.consent.RETENTION_DAYS
import com.latentic.graspy.consent.recordingsNotice
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.RecordingsCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

internal fun RecordingsCopy.daysLabel(days: Int): String = this.days.replace("{days}", days.toString())

/** "Keep recordings": off, each recording goes once it is marked; on, it stays for the days the parent chose. */
@Composable
internal fun KeepSwitch(copy: RecordingsCopy, consent: VoiceConsentDto?, enabled: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(value = consent != null, enabled = enabled, role = Role.Switch, onValueChange = { onToggle() })
            .padding(vertical = space(1)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(3)),
    ) {
        Column(Modifier.weight(1f)) {
            Text(copy.keep, color = GraspyColor.Ink, style = MaterialTheme.typography.titleMedium)
            Text(consent?.let { copy.keptFor.replace("{days}", it.retentionDays.toString()) } ?: copy.off, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
        }
        Switch(
            checked = consent != null,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = GraspyColor.OnAccent,
                checkedTrackColor = GraspyColor.Accent,
                uncheckedThumbColor = GraspyColor.Surface,
                uncheckedTrackColor = GraspyColor.Faint,
                uncheckedBorderColor = Color.Transparent,
            ),
        )
    }
}

/** The notice for the days chosen, with the choice of days above it and the parent's way to agree below. */
@Composable
internal fun KeepStep(
    copy: AccountCopy,
    state: RecordingsState,
    onDays: (Int) -> Unit,
    onAgree: () -> Unit,
    onCancel: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
        Text(copy.recordings.keepFor, color = GraspyColor.Ink, style = MaterialTheme.typography.titleMedium)
        DaysChoice(copy.recordings, state.days, !state.busy, onDays)
        ConsentNotice(
            copy = copy,
            notice = recordingsNotice(state.days),
            busy = state.busy,
            onAgree = onAgree,
            onCancel = onCancel,
            problem = state.problem.forNotice(),
        )
    }
}

@Composable
private fun DaysChoice(copy: RecordingsCopy, chosen: Int, enabled: Boolean, onChoose: (Int) -> Unit) {
    Row(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(space(2))) {
        RETENTION_DAYS.forEach { days ->
            val selected = days == chosen
            val shape = RoundedCornerShape(GraspyRadius.Pill)
            Text(
                copy.daysLabel(days),
                color = if (selected) GraspyColor.AccentInk else GraspyColor.Ink,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .background(if (selected) GraspyColor.AccentSoft else GraspyColor.Surface, shape)
                    .border(BorderStroke(1.dp, if (selected) GraspyColor.Accent else GraspyColor.Line), shape)
                    .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = tapping { onChoose(days) })
                    .padding(horizontal = space(4), vertical = space(2.5)),
            )
        }
    }
}

/** Stopping, with what was kept: deleted now, or left until each expires. */
@Composable
internal fun StopStep(
    copy: AccountCopy,
    busy: Boolean,
    onStopAndDelete: () -> Unit,
    onStopAndLeave: () -> Unit,
    onCancel: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
        Text(copy.recordings.stopTitle, color = GraspyColor.Ink, style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(space(2)), verticalArrangement = Arrangement.spacedBy(space(2))) {
            PrimaryButton(copy.recordings.stopDelete, onClick = onStopAndDelete, enabled = !busy)
            SecondaryButton(copy.recordings.stopKeep, onClick = onStopAndLeave, enabled = !busy)
            QuietButton(copy.cancel, onClick = onCancel, enabled = !busy)
        }
    }
}
