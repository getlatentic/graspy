package com.latentic.graspy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.core.os.ConfigurationCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.account.Account
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.onboarding.DetailsFormViewModel
import com.latentic.graspy.onboarding.PlanOnboarding
import com.latentic.graspy.onboarding.PlanSetupViewModel
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.plan.languageCodeOrGuess
import com.latentic.graspy.plan.voiceClass
import com.latentic.graspy.plan.voiceLanguage
import java.util.Locale

/**
 * A learner's app once chosen: a plan made first if they have none, as the web's onboarding makes it, then the
 * tabs. The plan decides the rest: the app's words follow its language, and a learner in a Nigerian primary
 * class gets voice lessons in their class and the teacher's nearest language.
 */
@Composable
fun LearnerHome(
    copy: AppCopy,
    appLanguage: AppLanguage,
    interfaceLanguage: InterfaceLanguage,
    account: Account,
    learnerKey: String,
    voice: MutableState<LearnerProfile?>,
    profiles: LearnerProfileStore,
    menu: AccountMenu,
    onWords: (InterfaceLanguage) -> Unit,
) {
    val planViewModel: PlanViewModel = viewModel()
    val plan by planViewModel.state.collectAsStateWithLifecycle()
    val form: DetailsFormViewModel = viewModel()
    val setup: PlanSetupViewModel = viewModel()
    val setupActive by setup.active.collectAsStateWithLifecycle()
    val ready = (plan as? PlanState.Ready)?.plan
    LaunchedEffect(ready) { ready?.let { followPlan(it, learnerKey, voice, profiles, onWords) } }
    val phone = ConfigurationCompat.getLocales(LocalConfiguration.current).get(0) ?: Locale.getDefault()

    when {
        plan == PlanState.Loading -> Box(Modifier.fillMaxSize().background(GraspyColor.Canvas), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = GraspyColor.Accent)
        }
        plan == PlanState.None || setupActive -> {
            LaunchedEffect(Unit) {
                if (!setup.active.value) {
                    form.start(null, phone.country, phone.language)
                    setup.begin(replanFor = null)
                }
            }
            val replanning = ready != null
            PlanOnboarding(
                learn = learnCopyFor(interfaceLanguage),
                form = form,
                setup = setup,
                suggestedCountry = phone.country.takeIf { it.isNotBlank() },
                display = Locale.forLanguageTag(interfaceLanguage.tag),
                make = planViewModel::make,
                onBack = if (replanning) setup::finish else null,
                onDone = { setup.finish() },
            )
        }
        else -> GraspyRoot(copy, appLanguage, interfaceLanguage, voice.value.takeIf { ready == null || ready.voiceClass() != null }, account, menu) {
            setup.begin(replanFor = form.form.value.details())
        }
    }
}

/** The words follow the plan's language, English when graspy has no words in it; voice lessons follow its class. */
private fun followPlan(plan: LearnerPlan, learnerKey: String, voice: MutableState<LearnerProfile?>, profiles: LearnerProfileStore, onWords: (InterfaceLanguage) -> Unit) {
    onWords(InterfaceLanguage.fromTag(plan.languageCodeOrGuess()) ?: InterfaceLanguage.ENGLISH)
    val derived = plan.voiceClass()?.let { LearnerProfile(it, plan.voiceLanguage()) } ?: return
    if (derived != voice.value) {
        profiles.save(learnerKey, derived)
        voice.value = derived
    }
}
