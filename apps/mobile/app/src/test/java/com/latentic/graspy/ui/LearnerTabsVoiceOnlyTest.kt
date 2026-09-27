package com.latentic.graspy.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.content.edit
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.PreferenceFiles
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.account.learnerKey
import com.latentic.graspy.account.signedIn
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.mcp.LearnerViews
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.settleMain
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A learner the server says learns by voice alone, as the app shows them: Home is their voice lessons, the tabs are
 * Home and You, and no subject or slide lesson shows, whatever their plan holds. The server decides, asked through
 * MCP; the answer kept stands without a connection.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class LearnerTabsVoiceOnlyTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val learn = learnCopyFor(InterfaceLanguage.ENGLISH)
    private val ada = learnerKey(UID, ADA.id)
    private val database = inMemoryDatabase()
    private val primary = PLAN.copy(system = "NG", level = "primary-2")
    private val nursery = PLAN.copy(system = "NG", level = "nursery-2")
    private val server = FakeGraspyServer(nursery, LearnerRecord())
    private var planViewModel: PlanViewModel? = null
    private var learnerViews: LearnerViews? = null
    private val viewModels = LearnerViewModels(
        LEARNER_VIEW_MODELS + mapOf(
            PlanViewModel::class.java to { app, key -> PlanViewModel(app, key, server.calls).also { planViewModel = it } },
            LearnerViews::class.java to { app, key ->
                LearnerViews(app, LearnerConnection(database, key, OkHttpClient(), server.web.url("/mcp")) { true }).also { learnerViews = it }
            },
        ),
    )

    @After
    fun close() {
        viewModels.keepOnly(null)
        database.close()
        server.web.shutdown()
    }

    @Test
    fun `a plan the server says learns by voice alone shows its voice lessons on Home, with Home and You, even holding subjects`() {
        server.voiceOnly = true
        shown(voice = LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))

        compose.onNodeWithText(learn.voice.title).assertExists()
        compose.onNodeWithText("Aunty Chioma").assertExists()
        compose.onNodeWithText(learn.nav.home).assertExists()
        compose.onNodeWithText(learn.nav.you).assertExists()
        compose.onNodeWithText(learn.nav.subjects).assertDoesNotExist()
        compose.onNodeWithText(learn.nav.ask).assertDoesNotExist()
        compose.onNodeWithText(learn.home.subjectsTitle).assertDoesNotExist()
        compose.onNodeWithText("Mathematics").assertDoesNotExist()
        assertEquals(buildJsonObject { put("system", "NG"); put("level", "nursery-2"); put("gradeLevel", "JSS 1") }, server.routesAsked.last())
    }

    @Test
    fun `a class the server says learns by voice alone, with no voice lessons in the app, is told so on Home and led to its details`() {
        server.voiceOnly = true
        shown(voice = null)

        compose.onNodeWithText(copyFor(InterfaceLanguage.ENGLISH).home.noLessons).assertExists()
        compose.onNodeWithText(learn.nav.subjects).assertDoesNotExist()
        compose.onNodeWithText(learn.you.change).performClick()
        compose.onNodeWithText(copyFor(InterfaceLanguage.ENGLISH).home.noLessons).assertDoesNotExist()
    }

    @Test
    fun `the class's name decides nothing, so a nursery plan the server says learns by slides keeps its subjects`() {
        server.voiceOnly = false
        shown(voice = LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))

        compose.onNodeWithText(learn.nav.subjects).assertExists()
        compose.onAllNodesWithText("Mathematics").onFirst().assertExists()
    }

    @Test
    fun `a plan with no class is asked about by the level the server reads, and follows its answer`() {
        server.plan = PLAN
        server.voiceOnly = true
        shown(voice = LearnerProfile(SchoolClass.KINDERGARTEN, AppLanguageSelection.ENGLISH))

        compose.onNodeWithText(learn.nav.subjects).assertDoesNotExist()
        compose.onNodeWithText("Mathematics").assertDoesNotExist()
        assertEquals(buildJsonObject { put("gradeLevel", "JSS 1") }, server.routesAsked.last())
    }

    @Test
    fun `without a connection the answer kept for the class stands`() {
        context().getSharedPreferences(PreferenceFiles.PLAN, 0).edit(commit = true) { putBoolean("route:$ada:NG|nursery-2|JSS 1", true) }
        server.routeFails = true
        shown(voice = LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH), answered = false)

        compose.onNodeWithText(learn.nav.subjects).assertDoesNotExist()
        compose.onNodeWithText(learn.voice.title).assertExists()
    }

    @Test
    fun `a primary plan keeps its subjects and all four tabs`() {
        server.plan = primary
        shown(voice = LearnerProfile(SchoolClass.PRIMARY_2, AppLanguageSelection.ENGLISH))

        compose.onNodeWithText(learn.nav.subjects).assertExists()
        compose.onNodeWithText(learn.nav.ask).assertExists()
        compose.onAllNodesWithText("Mathematics").onFirst().assertExists()
    }

    @Test
    fun `a subject open when the class becomes one that learns by voice alone neither shows nor takes the back button`() {
        server.plan = primary
        shown(voice = LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))
        compose.onAllNodesWithText("Mathematics").onFirst().performClick()
        compose.onNodeWithText("Number Systems").assertExists()
        assertTrue(compose.activity.onBackPressedDispatcher.hasEnabledCallbacks())

        server.plan = nursery
        server.voiceOnly = true
        requireNotNull(planViewModel).refresh()
        settleMain(TIMEOUT_MS) { (planViewModel?.state?.value as? PlanState.Ready)?.plan?.level == "nursery-2" }
        // The tabs ask about the plan's new class once they have drawn it.
        compose.waitForIdle()
        settleMain(TIMEOUT_MS) { learnerViews?.routes?.answers?.value?.get("NG|nursery-2|JSS 1") == true }
        compose.waitForIdle()

        compose.onNodeWithText("Number Systems").assertDoesNotExist()
        compose.onNodeWithText(learn.voice.title).assertExists()
        assertFalse(compose.activity.onBackPressedDispatcher.hasEnabledCallbacks())
    }

    private fun shown(voice: LearnerProfile?, answered: Boolean = true) {
        compose.setContent {
            LearnerScope(ada, viewModels) {
                GraspyTheme(InterfaceLanguage.ENGLISH) {
                    LearnerTabs(
                        copy = copyFor(InterfaceLanguage.ENGLISH),
                        learn = learn,
                        appLanguage = AppLanguage.ENGLISH,
                        interfaceLanguage = InterfaceLanguage.ENGLISH,
                        voice = voice,
                        account = signedIn(ADA, deviceJoins = false),
                        menu = AccountMenu({}, {}, {}, {}),
                        onReplan = {},
                        openVoiceLesson = {},
                    )
                }
            }
        }
        settleMain(TIMEOUT_MS) { planViewModel?.state?.value is PlanState.Ready }
        // The tabs ask about the plan's class once they have drawn the plan.
        compose.waitForIdle()
        if (answered) settleMain(TIMEOUT_MS) { server.routesAsked.isNotEmpty() && learnerViews?.routes?.answers?.value?.isNotEmpty() == true }
        compose.waitForIdle()
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
