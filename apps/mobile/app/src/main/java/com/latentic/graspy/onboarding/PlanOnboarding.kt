package com.latentic.graspy.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.PlanOnboardingCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.voiceOnly
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyHeader
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PageTitle
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space
import java.util.Locale

// The chosen subjects shown by name before the rest are counted.
private const val CHIPS_SHOWN = 6

/**
 * Making a plan, as the web's onboarding does: about you, then your subjects, then the plan being built; a class
 * that learns by voice alone goes from about you straight to [onDone]. [make] makes and keeps the plan; [onBack]
 * leaves a replan for the details it started from.
 */
@Composable
fun PlanOnboarding(
    learn: LearnCopy,
    form: DetailsFormViewModel,
    setup: PlanSetupViewModel,
    suggestedCountry: String?,
    display: Locale,
    make: suspend (LearnerDetails, List<String>) -> LearnerPlan,
    onBack: (() -> Unit)?,
    onDone: (LearnerPlan) -> Unit,
) {
    val step by setup.step.collectAsStateWithLifecycle()
    val values by form.form.collectAsStateWithLifecycle()
    val choices by setup.subjects.collectAsStateWithLifecycle()
    val building by setup.setup.collectAsStateWithLifecycle()
    val keeping by setup.keeping.collectAsStateWithLifecycle()
    val words = learn.onboarding
    val voiceOnly = values.details().voiceOnly
    val finish = { if (voiceOnly) setup.keep(values.details(), make, onDone) else setup.make(values.details(), make) }
    Frame {
        val made = building
        if (made != null) {
            SetupView(words, setup.chosenLabels, made, onRetry = finish, onAdjust = setup::adjust) { made.made?.let(onDone) }
            return@Frame
        }
        val index = step.ordinal
        val steps = if (voiceOnly) 1 else SetupStep.entries.size
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(space(8))) {
            Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
                Text(words.stepOf.filled("current" to index + 1, "total" to steps), style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
                PageTitle(if (step == SetupStep.PROFILE) words.steps.profile.title else words.steps.subjects.title)
            }
            when (step) {
                SetupStep.PROFILE -> ProfileStep(learn, form, suggestedCountry, display)
                SetupStep.SUBJECTS -> SubjectsStep(words.subjects, choices, setup::toggle) { setup.readSubjects(values.details()) }
            }
        }
        val canNext = if (step == SetupStep.PROFILE) values.complete else choices.chosen.isNotEmpty() && !choices.loading && !choices.failed
        val last = step == SetupStep.SUBJECTS || voiceOnly
        Footer(
            words,
            label = when {
                keeping -> words.settingUp
                last -> words.start
                else -> words.next
            },
            canNext = canNext && !keeping,
            onBack = when {
                step == SetupStep.SUBJECTS && onBack == null -> setup::toProfile
                else -> onBack
            },
            onNext = { if (last) finish() else setup.toSubjects(values.details()) },
        )
    }
}

/** Each part of onboarding under the header the rest of the app has, as the web's onboarding frame shows it. */
@Composable
private fun Frame(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().background(GraspyColor.Canvas)) {
        GraspyHeader()
        Column(
            Modifier.weight(1f).navigationBarsPadding().imePadding().padding(horizontal = space(6), vertical = space(6)),
            verticalArrangement = Arrangement.spacedBy(space(6)),
            content = content,
        )
    }
}

@Composable
private fun Footer(words: PlanOnboardingCopy, label: String, canNext: Boolean, onBack: (() -> Unit)?, onNext: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(space(3)), verticalAlignment = Alignment.CenterVertically) {
        onBack?.let { QuietButton(words.back, it) }
        Box(Modifier.weight(1f))
        PrimaryButton(label, onNext, enabled = canNext)
    }
}

@Composable
private fun SetupView(words: PlanOnboardingCopy, subjects: List<String>, setup: Setup, onRetry: () -> Unit, onAdjust: () -> Unit, onContinue: () -> Unit) {
    val ready = setup.made
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(space(6)), horizontalAlignment = Alignment.CenterHorizontally) {
        PageTitle(if (ready != null) words.ready.title else words.generating.title)
        if (ready != null) {
            Text(words.ready.body.filled("topics" to ready.topics.values.sumOf { it.size }), style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Muted)
        }
        SubjectChips(words, subjects)
        when {
            ready != null -> PrimaryButton(words.ready.`continue`, onContinue, Modifier.fillMaxWidth())
            setup.failed -> Failed(words, onRetry, onAdjust)
            else -> {
                Timeline(words, setup.stage)
                Text(
                    words.generating.wait,
                    style = MaterialTheme.typography.bodyMedium,
                    color = GraspyColor.AccentInk,
                    modifier = Modifier.fillMaxWidth().background(GraspyColor.AccentSoft, RoundedCornerShape(GraspyRadius.Card)).border(1.dp, GraspyColor.AccentLine, RoundedCornerShape(GraspyRadius.Card)).padding(space(3)),
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SubjectChips(words: PlanOnboardingCopy, subjects: List<String>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(space(2), Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(space(2))) {
        subjects.take(CHIPS_SHOWN).forEach { Chip(it) }
        (subjects.size - CHIPS_SHOWN).takeIf { it > 0 }?.let { Chip(words.moreSubjects.filled("count" to it)) }
    }
}

@Composable
private fun Chip(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium,
        color = GraspyColor.AccentInk,
        modifier = Modifier.background(GraspyColor.AccentSoft, RoundedCornerShape(GraspyRadius.Pill)).padding(horizontal = space(3), vertical = space(1)),
    )
}

@Composable
private fun Timeline(words: PlanOnboardingCopy, stage: Int) {
    val stages = words.generating.stages.let { listOf(it.analyzing.label, it.generating.label, it.personalizing.label) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(space(3))) {
        stages.forEachIndexed { index, label ->
            val done = index < stage
            val current = index == stage
            val shape = RoundedCornerShape(GraspyRadius.Card)
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(if (done || current) GraspyColor.AccentSoft else GraspyColor.Raised, shape)
                    .border(2.dp, if (current) GraspyColor.Accent else if (done) GraspyColor.AccentLine else GraspyColor.Line, shape)
                    .padding(space(3)),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(space(3)),
            ) {
                when {
                    current -> CircularProgressIndicator(Modifier.size(space(5)), color = GraspyColor.Accent, strokeWidth = 2.dp)
                    done -> Box(Modifier.size(space(5)).background(GraspyColor.AccentInk, CircleShape))
                    else -> Box(Modifier.size(space(5)).border(2.dp, GraspyColor.Line, CircleShape))
                }
                Text(label, style = MaterialTheme.typography.labelLarge, color = if (done) GraspyColor.AccentInk else GraspyColor.Ink)
            }
        }
    }
}

@Composable
private fun Failed(words: PlanOnboardingCopy, onRetry: () -> Unit, onAdjust: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(GraspyColor.DangerSoft, RoundedCornerShape(GraspyRadius.Card)).padding(space(5)),
        verticalArrangement = Arrangement.spacedBy(space(3)),
    ) {
        Text(words.generating.failed, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Danger)
        Text(words.generating.failedBody, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Danger, textAlign = TextAlign.Start)
        PrimaryButton(words.generating.tryAgain, onRetry, Modifier.fillMaxWidth())
        SecondaryButton(words.generating.adjust, onAdjust, Modifier.fillMaxWidth())
    }
}
