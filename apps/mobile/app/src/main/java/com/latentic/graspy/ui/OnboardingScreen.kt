package com.latentic.graspy.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass

/** Two questions, asked once: class, then language. Each step holds one heading and one control. */
enum class OnboardingStep { CLASS, LANGUAGE }

internal fun onboardingProfile(schoolClass: SchoolClass?, language: AppLanguageSelection?): LearnerProfile? =
    if (schoolClass != null && language != null) LearnerProfile(schoolClass, language) else null

/**
 * First open asks the class only. The language is detected from the learner's first note; the
 * language step is shown only when the profile is edited from the account menu.
 */
@Composable
fun OnboardingScreen(copy: AppCopy, initial: LearnerProfile?, askLanguage: Boolean, onDone: (LearnerProfile) -> Unit) {
    var step by rememberSaveable { mutableStateOf(OnboardingStep.CLASS) }
    var schoolClass by rememberSaveable { mutableStateOf(initial?.schoolClass) }
    var language by rememberSaveable { mutableStateOf(initial?.language ?: AppLanguageSelection.SYSTEM) }
    Surface(Modifier.fillMaxSize(), color = Graspy.Background) {
        Column(
            Modifier.statusBarsPadding().padding(horizontal = 24.dp, vertical = 40.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text(
                if (step == OnboardingStep.CLASS) copy.onboarding.whatClass else copy.onboarding.whichLanguage,
                color = Graspy.Text,
                style = MaterialTheme.typography.headlineLarge,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (step == OnboardingStep.CLASS) {
                    SchoolClass.entries.forEach { option ->
                        Choice(option.label, selected = option == schoolClass) { schoolClass = option }
                    }
                } else {
                    languageOptions(copy).forEach { (option, label) ->
                        Choice(label, selected = option == language) { language = option }
                    }
                }
            }
            val ready = step != OnboardingStep.CLASS || schoolClass != null
            Button(
                onClick = tapping {
                    if (step == OnboardingStep.CLASS && askLanguage) {
                        step = OnboardingStep.LANGUAGE
                    } else {
                        onboardingProfile(schoolClass, language)?.let(onDone)
                    }
                },
                enabled = ready,
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                shape = RoundedCornerShape(26.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Graspy.Action, disabledContainerColor = Graspy.AccentBorder),
            ) {
                Text(copy.onboarding.next, color = Graspy.OnAction, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
    }
}

internal fun languageOptions(copy: AppCopy): List<Pair<AppLanguageSelection, String>> = listOf(
    AppLanguageSelection.SYSTEM to copy.onboarding.detectLanguage,
    AppLanguageSelection.ENGLISH to "English",
    AppLanguageSelection.YORUBA to "Yorùbá + English",
    AppLanguageSelection.PIDGIN to "Pidgin + English",
)

@Composable
private fun Choice(label: String, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Text(
        label,
        color = if (selected) Graspy.OnAction else Graspy.Text,
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier
            .background(if (selected) Graspy.Action else Graspy.Surface, shape)
            .border(BorderStroke(1.dp, if (selected) Graspy.Action else Graspy.Border), shape)
            .clickable(onClick = tapping(onClick))
            .padding(horizontal = 18.dp, vertical = 14.dp),
    )
}
