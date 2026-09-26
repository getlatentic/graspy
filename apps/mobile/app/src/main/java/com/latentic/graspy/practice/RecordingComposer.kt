package com.latentic.graspy.practice

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.latentic.graspy.localization.LessonCopy
import com.latentic.graspy.ui.Graspy

/** The Intron sync endpoint rejects files above 120 s; stop a little before that limit. */
const val MAX_VOICE_NOTE_SECONDS = 110

internal fun composerLabel(copy: LessonCopy, phase: LessonPhase): String? = when (phase) {
    LessonPhase.LEARNER_READY -> copy.recordTable
    LessonPhase.LEARNER_RECORDING -> copy.stopAndSend
    LessonPhase.COMPLETE -> copy.recordAgain
    LessonPhase.SEND_FAILED -> copy.sendAgain
    else -> null
}

internal fun composerStatus(copy: LessonCopy, phase: LessonPhase, teacherFailed: Boolean = false): String = when {
    teacherFailed -> copy.teacherAudioFailed
    phase == LessonPhase.TEACHER_BUFFERING || phase == LessonPhase.FEEDBACK_BUFFERING -> copy.teacherReady
    phase == LessonPhase.TEACHER_PLAYING || phase == LessonPhase.FEEDBACK_PLAYING -> copy.teacherSpeaking
    phase == LessonPhase.UPLOADING -> copy.sending
    phase == LessonPhase.ANALYSING -> copy.analysing
    else -> ""
}

/** Voice only: one wide button that records, stops, or re-sends. Nothing here looks typeable. */
@Composable
fun RecordingComposer(
    copy: LessonCopy,
    phase: LessonPhase,
    seconds: Int,
    teacherFailed: Boolean,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onResend: () -> Unit,
    error: String?,
) {
    val label = composerLabel(copy, phase)
    val recording = phase == LessonPhase.LEARNER_RECORDING
    val resend = phase == LessonPhase.SEND_FAILED
    Column(Modifier.fillMaxWidth().background(Graspy.Surface)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Graspy.Border))
        Column(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (error != null) {
                Text(error, color = Graspy.Danger, style = MaterialTheme.typography.bodyMedium)
            }
            val background = when {
                recording -> Graspy.Danger
                label != null -> Graspy.Action
                else -> Graspy.Hairline
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .background(background, RoundedCornerShape(28.dp))
                    .clickable(enabled = label != null, onClick = if (recording) onStop else if (resend) onResend else onStart),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                when {
                    label != null -> {
                        Icon(
                            when {
                                recording -> Icons.Rounded.Stop
                                resend -> Icons.Rounded.Send
                                else -> Icons.Rounded.Mic
                            },
                            contentDescription = null,
                            tint = Graspy.OnAction,
                            modifier = Modifier.size(24.dp).padding(end = 2.dp),
                        )
                        Text(
                            if (recording) "${formatElapsed(seconds)} · $label" else label,
                            color = Graspy.OnAction,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    teacherFailed -> Text(composerStatus(copy, phase, true), color = Graspy.Danger, fontWeight = FontWeight.Bold)
                    else -> {
                        CircularProgressIndicator(Modifier.size(18.dp), color = Graspy.Brand, strokeWidth = 2.dp)
                        Text(
                            composerStatus(copy, phase),
                            color = Graspy.TextMuted,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(start = 10.dp),
                        )
                    }
                }
            }
        }
    }
}
