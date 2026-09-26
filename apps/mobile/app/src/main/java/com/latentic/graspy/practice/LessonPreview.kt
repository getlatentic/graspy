package com.latentic.graspy.practice

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.ui.Graspy

internal fun lessonStartEnabled(startRequested: Boolean): Boolean = !startRequested

/** One card, one heading, one control: the lesson you are about to do and how to start it. */
@Composable
fun LessonPreview(
    teacher: Teacher,
    copy: AppCopy,
    lesson: com.latentic.graspy.localization.LessonCopy,
    voiceState: TeacherVoiceState,
    startRequested: Boolean,
    onStart: () -> Unit,
) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        Modifier.fillMaxWidth().background(Graspy.Surface, shape).border(BorderStroke(1.dp, Graspy.Border), shape).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(lesson.eyebrow.uppercase(), color = Graspy.AccentText, style = MaterialTheme.typography.labelMedium)
        Text(lesson.title, color = Graspy.Text, style = MaterialTheme.typography.headlineMedium)
        Text(lesson.detail, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyLarge)
        Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            copy.lesson.steps.forEach { step -> StagePill(step) }
        }
        Button(
            onClick = onStart,
            enabled = lessonStartEnabled(startRequested),
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(top = 6.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Graspy.Action, disabledContainerColor = Graspy.AccentBorder),
            shape = RoundedCornerShape(26.dp),
        ) {
            Text(
                if (startRequested) copy.preparingTeacher else copy.startLesson,
                color = Graspy.OnAction,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            )
        }
        if (voiceState == TeacherVoiceState.FAILED) {
            Text(copy.lesson.teacherAudioFailed, color = Graspy.Danger, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun StagePill(label: String) {
    Text(
        label,
        color = Graspy.AccentText,
        style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.background(Graspy.AccentSurface, RoundedCornerShape(8.dp)).padding(horizontal = 10.dp, vertical = 7.dp),
    )
}
