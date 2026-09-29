package com.latentic.graspy.recordings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.core.os.ConfigurationCompat
import com.latentic.graspy.localization.RecordingsCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space
import java.util.Locale

/** One kept recording: when it was made, what for and how long, with its play button and its delete. */
@Composable
fun RecordingRow(
    copy: RecordingsCopy,
    recording: KeptRecordingDto,
    playing: Boolean,
    fetching: Boolean,
    busy: Boolean,
    onPlay: () -> Unit,
    onDelete: () -> Unit,
) {
    val locale = ConfigurationCompat.getLocales(LocalConfiguration.current).get(0) ?: Locale.getDefault()
    Row(
        Modifier.padding(horizontal = space(4), vertical = space(3)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(2)),
    ) {
        Text(
            recordingLabel(recording, locale),
            color = GraspyColor.Ink,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Column(horizontalAlignment = Alignment.End) {
            SecondaryButton(if (playing) copy.stop else copy.play, onClick = onPlay, enabled = !fetching)
            QuietButton(copy.delete, onClick = onDelete, enabled = !busy)
        }
    }
}
