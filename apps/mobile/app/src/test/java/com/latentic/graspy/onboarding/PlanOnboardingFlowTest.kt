package com.latentic.graspy.onboarding

import android.os.Looper
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.localization.filled
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.plan.CurriculumSource
import com.latentic.graspy.plan.GeneratedSubject
import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.Names
import com.latentic.graspy.plan.PlanMaker
import com.latentic.graspy.plan.SchoolLevel
import com.latentic.graspy.plan.SchoolStage
import com.latentic.graspy.plan.SchoolSystem
import com.latentic.graspy.plan.planJson
import com.latentic.graspy.plan.voiceClass
import com.latentic.graspy.ui.GraspyTheme
import java.time.Duration
import java.util.Locale
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** A new learner makes their plan from start to finish: details, subjects, the plan being made, then ready. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class PlanOnboardingFlowTest {
    @get:Rule
    val compose = createComposeRule()

    private val learn = learnCopyFor(InterfaceLanguage.ENGLISH)
    private val words = learn.onboarding

    private val nigeria = SchoolSystem(
        id = "NG", country = "NG", name = Names("Nigeria"), main = true,
        stages = listOf(SchoolStage("early-childhood", Names("Early childhood")), SchoolStage("jss", Names("Junior Secondary School"))),
        levels = listOf(
            SchoolLevel("nursery-1", "early-childhood", Names("Nursery 1"), listOf("N1"), 3),
            SchoolLevel("jss-1", "jss", Names("JSS 1"), listOf("JS1"), 12),
        ),
    )
    private val offered = listOf(
        GeneratedSubject("maths", "Mathematics", true),
        GeneratedSubject("english", "English Language", true),
        GeneratedSubject("art", "Cultural and Creative Arts", false),
    )
    private val subjectsAsked = mutableListOf<List<String>>()

    @Test
    fun `a new learner chooses their class and subjects and gets their plan`() {
        var made: Pair<LearnerDetails, List<String>>? = null
        val plan = LearnerPlan(planId = "plan-1")

        val done = planMadeFor("JSS 1") { details, subjects -> made = details to subjects; plan }

        assertEquals(listOf(listOf("Nigeria", "English", "JSS 1 (Junior Secondary School), Nigeria, age 12")), subjectsAsked)
        val (details, subjects) = requireNotNull(made)
        assertEquals("NG", details.country)
        assertEquals("en", details.language)
        assertEquals("JSS 1 (Junior Secondary School), Nigeria, age 12", details.gradeLevel)
        assertEquals(listOf("Mathematics", "English Language"), subjects)
        assertEquals(plan, done)
    }

    @Test
    fun `a Nigerian nursery learner's plan gives voice lessons in their class`() {
        val stream = CurriculumSource { _, onResult ->
            onResult(planJson.parseToJsonElement("""{"type":"result","subjects":["Mathematics"]}""").jsonObject)
            null
        }

        val plan = requireNotNull(planMadeFor("Nursery 1") { details, subjects -> PlanMaker(stream).make(details, subjects) })

        assertEquals(listOf("NG", "nursery-1"), listOf(plan.system, plan.level))
        assertEquals(SchoolClass.NURSERY_1, plan.voiceClass())
    }

    /** Onboarding from the first step to the plan made, for the class named [className]. */
    private fun planMadeFor(className: String, make: suspend (LearnerDetails, List<String>) -> LearnerPlan): LearnerPlan? {
        val form = DetailsFormViewModel { country -> listOf(nigeria).filter { it.country == country } }
        val setup = PlanSetupViewModel { country, language, gradeLevel, onSubjects ->
            subjectsAsked += listOf(country, language, gradeLevel)
            onSubjects(offered)
            null
        }
        var done: LearnerPlan? = null
        form.start(null, phoneCountry = "NG", phoneLanguage = "en")
        setup.begin(replanFor = null)

        compose.setContent {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                PlanOnboarding(
                    learn = learn,
                    form = form,
                    setup = setup,
                    suggestedCountry = "NG",
                    display = Locale.ENGLISH,
                    make = make,
                    onBack = null,
                    onDone = { done = it },
                )
            }
        }

        compose.onNodeWithText(words.stepOf.filled("current" to 1, "total" to 2)).assertExists()
        compose.onNodeWithText(words.next).assertIsNotEnabled()
        compose.onNodeWithContentDescription(words.profile.gradeLabel, substring = true).performScrollTo().performClick()
        compose.onNodeWithText(className).performClick()
        compose.onNodeWithText(words.next).assertIsEnabled().performClick()

        compose.onNodeWithText(words.steps.subjects.title).assertExists()
        compose.onNodeWithText(words.start).assertIsEnabled().performClick()

        compose.onNodeWithText(words.generating.title).assertExists()
        shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(5))
        compose.onNodeWithText(words.ready.title).assertExists()
        compose.onNodeWithText(words.ready.`continue`).performClick()
        return done
    }
}
