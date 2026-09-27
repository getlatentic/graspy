package com.latentic.graspy.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.content.edit
import androidx.work.Configuration
import androidx.work.WorkManager
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.PreferenceFiles
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.account.learnerKey
import com.latentic.graspy.account.signedIn
import com.latentic.graspy.home.HomeCatalogueViewModel
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.mcp.HOLDS_EVERY_FILE
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.mcp.LearnerViews
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.settleMain
import com.latentic.graspy.sync.CatalogueLessonEntity
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
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
    private val copy = copyFor(InterfaceLanguage.ENGLISH)
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
                LearnerViews(app, LearnerConnection(database, key, OkHttpClient(), server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }).also { learnerViews = it }
            },
            HomeCatalogueViewModel::class.java to { app, key -> HomeCatalogueViewModel(app, key, database.lessonCacheDao(), {}) { true } },
        ),
    )
    private val opened = mutableListOf<String?>()

    @Before
    fun work() {
        if (!WorkManager.isInitialized()) WorkManager.initialize(context(), Configuration.Builder().setExecutor { it.run() }.build())
    }

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

        compose.onNodeWithText(copy.home.noLessons).assertExists()
        compose.onNodeWithText(learn.nav.subjects).assertDoesNotExist()
        compose.onNodeWithText(learn.you.change).performClick()
        compose.onNodeWithText(copy.home.noLessons).assertDoesNotExist()
    }

    @Test
    fun `for a class that learns by voice alone Home is the lesson list, with no card to start from, and a lesson opens from it`() {
        server.voiceOnly = true
        stored(
            SchoolClass.NURSERY_2,
            voiceLesson(SchoolClass.NURSERY_2, "alphabet", "english.alphabet.say", "Saying the alphabet", current = true),
            voiceLesson(SchoolClass.NURSERY_2, "alphabet", "english.alphabet.a", "The letter A"),
        )
        shown(voice = LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))
        awaitListed("Saying the alphabet")

        listed("Letters and sounds").assertExists()
        listed("Saying the alphabet").assertExists()
        compose.onNodeWithText(copy.home.startHere).assertExists()
        compose.onNodeWithText(learn.voice.start).assertDoesNotExist()
        assertFalse(compose.activity.onBackPressedDispatcher.hasEnabledCallbacks())

        listed("The letter A").performClick()
        listed("Saying the alphabet").performClick()

        assertEquals(listOf("english.alphabet.a", null), opened)
    }

    @Test
    fun `a primary class keeps its card on Home, and the lesson list opens from it`() {
        server.plan = primary
        stored(SchoolClass.PRIMARY_2, voiceLesson(SchoolClass.PRIMARY_2, "multiplication", "mathematics.table-2", "The two times table", current = true))
        shown(voice = LearnerProfile(SchoolClass.PRIMARY_2, AppLanguageSelection.ENGLISH))

        listed("The two times table").assertDoesNotExist()
        // The topic to continue comes before the voice card, with a Start of its own.
        compose.onAllNodesWithText(learn.voice.start).onLast().performClick()
        awaitListed("The two times table")

        compose.onNodeWithText(learn.voice.title).assertExists()
        compose.onNodeWithText(learn.home.subjectsTitle).assertDoesNotExist()
        assertTrue(compose.activity.onBackPressedDispatcher.hasEnabledCallbacks())
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
                        copy = copy,
                        learn = learn,
                        appLanguage = AppLanguage.ENGLISH,
                        interfaceLanguage = InterfaceLanguage.ENGLISH,
                        voice = voice,
                        account = signedIn(ADA, deviceJoins = false),
                        menu = AccountMenu({}, {}, {}, {}),
                        onReplan = {},
                        openVoiceLesson = { opened += it },
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

    private fun stored(schoolClass: SchoolClass, vararg lessons: CatalogueLessonEntity) = runBlocking {
        database.lessonCacheDao().replaceCatalogue(ada, schoolClass.wireValue, lessons.toList())
    }

    private fun voiceLesson(schoolClass: SchoolClass, topic: String, planId: String, title: String, current: Boolean = false) = CatalogueLessonEntity(
        ownerId = ada,
        learnerClass = schoolClass.wireValue,
        planId = planId,
        position = if (current) 0 else 1,
        subject = planId.substringBefore('.'),
        topic = topic,
        titleJson = """{"en":"$title"}""",
        standing = "untouched",
        daysCorrect = 0,
        current = current,
        day = "2026-09-27",
        fetchedAtEpochMillis = 1L,
    )

    /** A line of the lesson list: its rows are buttons, so their words sit below them in the tree. */
    private fun listed(text: String) = compose.onNodeWithText(text, useUnmergedTree = true)

    /** The stored lessons are read off the main thread. */
    private fun awaitListed(text: String) = compose.waitUntil(TIMEOUT_MS) {
        compose.onAllNodesWithText(text, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
