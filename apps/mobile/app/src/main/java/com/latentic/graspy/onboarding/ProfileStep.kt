package com.latentic.graspy.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.PlanOnboardingProfileCopy
import com.latentic.graspy.plan.AFTER_SCHOOL
import com.latentic.graspy.plan.COUNTRY_LANGUAGES
import com.latentic.graspy.plan.SUPPORTED_LANGUAGES
import com.latentic.graspy.plan.SchoolSystem
import com.latentic.graspy.plan.countriesInOrder
import com.latentic.graspy.plan.countryName
import com.latentic.graspy.plan.isAfterSchool
import com.latentic.graspy.plan.languageLabel
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping
import java.util.Locale

/** Country, language and class, as the web's profile step asks them. [suggested] leads the country list. */
@Composable
fun ProfileStep(learn: LearnCopy, form: DetailsFormViewModel, suggested: String?, display: Locale) {
    val words = learn.onboarding.profile
    val values by form.form.collectAsStateWithLifecycle()
    val systems by form.systems.collectAsStateWithLifecycle()
    val countries = remember(suggested, display) { countryOptions(words, suggested, display) }
    Column(verticalArrangement = Arrangement.spacedBy(space(6))) {
        SearchableSelect(words.countryLabel, values.country, countries, words.countryPlaceholder, words.noResults, onChoose = form::chooseCountry)
        SearchableSelect(
            words.languageLabel, values.language, languageOptions(words, values.country, display), words.languagePlaceholder, words.noResults,
            enabled = values.country.isNotBlank(), onChoose = form::chooseLanguage,
        )
        val found = (systems as? Systems.Ready)?.systems.orEmpty()
        if (found.size > 1) SystemChoice(words.systemLabel, found, values.system, values.language, form::chooseSystem)
        Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
            SearchableSelect(
                words.gradeLabel, values.level, classOptions(learn, found.firstOrNull { it.id == values.system }, values.language),
                if (values.country.isBlank()) words.gradeNeedsCountry else words.gradePlaceholder, words.noResults,
                enabled = values.country.isNotBlank() && systems is Systems.Ready, onChoose = form::chooseLevel,
            )
            SystemsStatus(learn, systems, form::readSystems)
        }
        if (isAfterSchool(values.level)) CourseField(words.courseLabel, words.coursePlaceholder, values.course, form::setCourse)
    }
}

private fun countryOptions(words: PlanOnboardingProfileCopy, suggested: String?, display: Locale): List<SelectOption> =
    countriesInOrder(suggested).map { code ->
        SelectOption(code, countryName(code, display), if (code == suggested) words.suggested else words.allCountries)
    }

/** The country's own languages first; any other language graspy teaches in after them. */
private fun languageOptions(words: PlanOnboardingProfileCopy, country: String, display: Locale): List<SelectOption> {
    val spoken = COUNTRY_LANGUAGES[country].orEmpty()
    val others = SUPPORTED_LANGUAGES.filterNot(spoken::contains)
        .map { SelectOption(it, languageLabel(it, display), words.allLanguages) }
        .sortedBy { it.label }
    return spoken.map { SelectOption(it, languageLabel(it, display), words.suggested) } + others
}

private fun classOptions(learn: LearnCopy, system: SchoolSystem?, language: String): List<SelectOption> {
    val stages = system?.stages.orEmpty().associate { it.id to it.name }
    val school = system?.levels.orEmpty().map { level ->
        SelectOption(level.id, level.name.inLanguage(language), stages[level.stage]?.inLanguage(language), listOf(level.name.en) + level.aliases)
    }
    val afterSchool = AFTER_SCHOOL.map { level ->
        SelectOption(level, if (level == "graduate") learn.level.graduate else learn.level.undergraduate, learn.onboarding.profile.afterSchool)
    }
    return school + afterSchool
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SystemChoice(label: String, systems: List<SchoolSystem>, chosen: String, language: String, onChoose: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Ink)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(space(2)), verticalArrangement = Arrangement.spacedBy(space(2))) {
            systems.forEach { system ->
                val on = system.id == chosen
                val shape = RoundedCornerShape(GraspyRadius.Card)
                Text(
                    system.name.inLanguage(language),
                    style = MaterialTheme.typography.labelLarge,
                    color = GraspyColor.Ink,
                    modifier = Modifier
                        .clip(shape)
                        .background(if (on) GraspyColor.AccentSoft else GraspyColor.Surface)
                        .border(1.dp, if (on) GraspyColor.Accent else GraspyColor.Line, shape)
                        .clickable(onClick = tapping { onChoose(system.id) })
                        .semantics { selected = on }
                        .padding(horizontal = space(4), vertical = space(2.5)),
                )
            }
        }
    }
}

@Composable
private fun SystemsStatus(learn: LearnCopy, systems: Systems, onRetry: () -> Unit) {
    when (systems) {
        Systems.Loading -> Text(learn.onboarding.profile.gradesLoading, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Muted)
        Systems.Failed -> Column {
            Text(learn.onboarding.profile.gradesFailed, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.Danger)
            QuietButton(learn.onboarding.subjects.tryAgain, onRetry)
        }
        else -> Unit
    }
}

@Composable
private fun CourseField(label: String, placeholder: String, value: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(2))) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = GraspyColor.Ink)
        val shape = RoundedCornerShape(GraspyRadius.Control)
        Box(Modifier.fillMaxWidth().background(GraspyColor.Surface, shape).border(1.dp, GraspyColor.Line, shape).padding(horizontal = space(4), vertical = space(3))) {
            if (value.isEmpty()) Text(placeholder, style = MaterialTheme.typography.bodyLarge, color = GraspyColor.Muted)
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = GraspyColor.Ink),
                cursorBrush = SolidColor(GraspyColor.Accent),
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
            )
        }
    }
}
