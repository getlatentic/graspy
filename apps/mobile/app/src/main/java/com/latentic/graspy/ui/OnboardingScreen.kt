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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass

/**
 * Asked once: the class. Changed from the account menu: the class, the language the teacher speaks,
 * then the language of the app's words, which are separate choices. Each step holds one heading and
 * one control.
 */
enum class OnboardingStep { CLASS, LANGUAGE, INTERFACE }

internal fun onboardingProfile(schoolClass: SchoolClass?, language: AppLanguageSelection?): LearnerProfile? =
    if (schoolClass != null && language != null) LearnerProfile(schoolClass, language) else null

internal fun nextStep(step: OnboardingStep, askLanguage: Boolean): OnboardingStep? = when {
    !askLanguage -> null
    step == OnboardingStep.CLASS -> OnboardingStep.LANGUAGE
    step == OnboardingStep.LANGUAGE -> OnboardingStep.INTERFACE
    else -> null
}

/**
 * First open asks the class only: the lesson language is detected from the learner's first note, and
 * the app's words follow the phone. Both languages are asked only when the profile is edited.
 */
@Composable
fun OnboardingScreen(
    copy: AppCopy,
    initial: LearnerProfile?,
    askLanguage: Boolean,
    interfaceLanguage: InterfaceLanguage?,
    onDone: (LearnerProfile, InterfaceLanguage?) -> Unit,
) {
    var step by rememberSaveable { mutableStateOf(OnboardingStep.CLASS) }
    var schoolClass by rememberSaveable { mutableStateOf(initial?.schoolClass) }
    var language by rememberSaveable { mutableStateOf(initial?.language ?: AppLanguageSelection.SYSTEM) }
    var words by rememberSaveable { mutableStateOf(interfaceLanguage) }
    Surface(Modifier.fillMaxSize(), color = Graspy.Background) {
        Column(
            Modifier.statusBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 40.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            StepHeading(copy, step)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                when (step) {
                    OnboardingStep.CLASS -> SchoolClass.entries.forEach { option ->
                        Choice(copy.onboarding.classLabel(option), selected = option == schoolClass) { schoolClass = option }
                    }
                    OnboardingStep.LANGUAGE -> languageOptions(copy).forEach { (option, label) ->
                        Choice(label, selected = option == language) { language = option }
                    }
                    OnboardingStep.INTERFACE -> interfaceOptions(copy).forEach { (option, label) ->
                        Choice(label, selected = option == words) { words = option }
                    }
                }
            }
            NextButton(copy.onboarding.next, enabled = step != OnboardingStep.CLASS || schoolClass != null) {
                val next = nextStep(step, askLanguage)
                if (next != null) step = next else onboardingProfile(schoolClass, language)?.let { onDone(it, words) }
            }
        }
    }
}

@Composable
private fun StepHeading(copy: AppCopy, step: OnboardingStep) {
    val (heading, note) = when (step) {
        OnboardingStep.CLASS -> copy.onboarding.whatClass to null
        OnboardingStep.LANGUAGE -> copy.onboarding.whichLanguage to copy.onboarding.lessonLanguageNote
        OnboardingStep.INTERFACE -> copy.onboarding.whichInterface to copy.onboarding.interfaceNote
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(heading, color = Graspy.Text, style = MaterialTheme.typography.headlineLarge)
        note?.let { Text(it, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyLarge) }
    }
}

@Composable
private fun NextButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = tapping(onClick),
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Graspy.Action, disabledContainerColor = Graspy.AccentBorder),
    ) {
        Text(label, color = Graspy.OnAction, fontWeight = FontWeight.Bold, fontSize = 16.sp)
    }
}

/** The languages the teacher speaks, each named in itself. */
internal fun languageOptions(copy: AppCopy): List<Pair<AppLanguageSelection, String>> = listOf(
    AppLanguageSelection.SYSTEM to copy.onboarding.detectLanguage,
    AppLanguageSelection.ENGLISH to "English",
    AppLanguageSelection.YORUBA to "Yorùbá + English",
    AppLanguageSelection.PIDGIN to "Pidgin + English",
)

/** The languages of the app's words, each named in itself; none follows the phone. */
internal fun interfaceOptions(copy: AppCopy): List<Pair<InterfaceLanguage?, String>> =
    listOf<Pair<InterfaceLanguage?, String>>(null to copy.onboarding.followPhone) +
        InterfaceLanguage.entries.map { it to it.nativeName }

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
