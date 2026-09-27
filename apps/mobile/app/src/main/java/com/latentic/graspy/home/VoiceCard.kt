package com.latentic.graspy.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.VoiceNoteCopy
import com.latentic.graspy.practice.Teacher
import com.latentic.graspy.ui.GraspyCard
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyText
import com.latentic.graspy.ui.PageTitle
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.Section
import com.latentic.graspy.ui.icons.Lucide
import com.latentic.graspy.ui.space

/** Who is teaching, said once, so no lesson row has to repeat it: the web's TeacherStrip. */
@Composable
fun TeacherStrip(teacher: Teacher, modifier: Modifier = Modifier, detail: String? = null) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(space(3))) {
        Box(Modifier.size(space(11)).background(GraspyColor.Accent, CircleShape), contentAlignment = Alignment.Center) {
            Text(teacher.initial, color = GraspyColor.OnAccent, style = GraspyText.Lg.copy(fontFamily = MaterialTheme.typography.headlineSmall.fontFamily, fontWeight = FontWeight.SemiBold))
        }
        Column {
            Text(teacher.name, color = GraspyColor.Ink, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            detail?.let { Text(it, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

/** Home's way into voice lessons, as the web's VoiceCard: the teacher, and Start. */
@Composable
fun VoiceCard(words: VoiceNoteCopy, teacher: Teacher, onStart: () -> Unit) {
    Section(words.title) {
        GraspyCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(space(4))) {
                TeacherStrip(teacher, modifier = Modifier.weight(1f))
                PrimaryButton(words.start, onStart, icon = Lucide.Mic)
            }
        }
    }
}

/**
 * Home for a class that learns by voice alone when the app has no voice lessons for it yet, as the web's
 * NoVoiceCard: it says so, and leads to the details in case the class is wrong.
 */
@Composable
fun NoVoiceCard(words: VoiceNoteCopy, noLessons: String, change: String, onChange: () -> Unit) {
    Section(words.title) {
        GraspyCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(space(4))) {
                Text(noLessons, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                SecondaryButton(change, onChange)
            }
        }
    }
}

/** Every voice lesson of the learner's class, by theme, and where each stands, as the web's voice page. */
@Composable
fun VoicePage(words: VoiceNoteCopy, copy: AppCopy, teacher: Teacher, language: String, state: CatalogueState, onStartLesson: () -> Unit, onOpenLesson: (String) -> Unit, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(6))) {
        PageTitle(words.title)
        TeacherStrip(teacher, detail = language)
        VoiceLessons(copy, state, onStartLesson, onOpenLesson, onRetry)
    }
}
