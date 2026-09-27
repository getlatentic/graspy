package com.latentic.graspy.ui

import android.Manifest
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.work.Configuration
import androidx.work.WorkManager
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.account.learnerKey
import com.latentic.graspy.account.signedIn
import com.latentic.graspy.collection.CollectionViewModel
import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import com.latentic.graspy.collection.outbox.AppGraph
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
import com.latentic.graspy.practice.PracticeExercise
import com.latentic.graspy.settleMain
import com.latentic.graspy.sync.CatalogueLessonEntity
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAudioRecord.AudioRecordSourceProvider
import org.robolectric.shadows.ShadowAudioRecord

/** Back from a voice lesson, by the phone's back button, finds the lesson list it was opened from. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class VoiceLessonBackTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val learn = learnCopyFor(InterfaceLanguage.ENGLISH)
    private val ada = learnerKey(UID, ADA.id)
    private val database = inMemoryDatabase()
    private val server = FakeGraspyServer(PLAN.copy(system = "NG", level = "nursery-2"), LearnerRecord())
    private var planViewModel: PlanViewModel? = null
    private var learnerViews: LearnerViews? = null
    private var collection: CollectionViewModel? = null
    private val viewModels = LearnerViewModels(
        LEARNER_VIEW_MODELS + mapOf(
            PlanViewModel::class.java to { app, key -> PlanViewModel(app, key, server.calls).also { planViewModel = it } },
            LearnerViews::class.java to { app, key ->
                LearnerViews(app, LearnerConnection(database, key, OkHttpClient(), server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }).also { learnerViews = it }
            },
            HomeCatalogueViewModel::class.java to { app, key -> HomeCatalogueViewModel(app, key, database.lessonCacheDao(), {}) { true } },
            CollectionViewModel::class.java to { app, key -> CollectionViewModel(app, key).also { collection = it } },
        ),
    )

    @Before
    fun work() {
        if (!WorkManager.isInitialized()) WorkManager.initialize(context(), Configuration.Builder().setExecutor { it.run() }.build())
        // The note before a first voice lesson is not what these tests are about.
        AppGraph.account(context()).profiles.seeVoiceNote(ada)
    }

    @After
    fun close() {
        viewModels.keepOnly(null)
        database.close()
        server.web.shutdown()
    }

    @Test
    fun `for a class that learns by voice alone, back from a lesson is Home, its lesson list`() {
        server.voiceOnly = true
        stored(SchoolClass.NURSERY_2, "alphabet", "english.alphabet.say", "Saying the alphabet")
        shown(LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))
        awaitListed("Saying the alphabet")

        openLesson("Saying the alphabet")
        listed("Letters and sounds").assertDoesNotExist()

        pressBack()

        listed("Letters and sounds").assertExists()
        listed("Saying the alphabet").assertExists()
        compose.onNodeWithText(learn.voice.start).assertDoesNotExist()
        assertFalse(compose.activity.onBackPressedDispatcher.hasEnabledCallbacks())
    }

    @Test
    fun `for a primary class, back from a lesson is the lesson list it opened from, not Home`() {
        server.plan = PLAN.copy(system = "NG", level = "primary-2")
        stored(SchoolClass.PRIMARY_2, "multiplication", "mathematics.table-2", "The two times table")
        shown(LearnerProfile(SchoolClass.PRIMARY_2, AppLanguageSelection.ENGLISH))
        // The topic to continue comes before the voice card, with a Start of its own.
        compose.onAllNodesWithText(learn.voice.start).onLast().performClick()
        awaitListed("The two times table")

        openLesson("The two times table")
        listed("Times tables").assertDoesNotExist()

        pressBack()

        listed("The two times table").assertExists()
        compose.onNodeWithText(learn.home.subjectsTitle).assertDoesNotExist()
    }

    @Test
    fun `back during a take ends it, so the microphone is never left on outside the lesson and nothing is sent as its answer`() {
        server.voiceOnly = true
        stored(SchoolClass.NURSERY_2, "alphabet", "english.alphabet.say", "Saying the alphabet")
        shown(LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))
        awaitListed("Saying the alphabet")
        openLesson("Saying the alphabet")
        val take = startTake()

        pressBack()

        listed("Saying the alphabet").assertExists()
        val ended = take.state.value
        assertFalse(ended.isRecording)
        assertFalse(ended.isSaving)
        assertNull(ended.queuedLocalId)
        assertEquals(0, take.droppedTakes.value)
        assertTrue(recordings().isEmpty())
    }

    @Test
    fun `turning the phone during a take keeps it, since the lesson is still open`() {
        server.voiceOnly = true
        stored(SchoolClass.NURSERY_2, "alphabet", "english.alphabet.say", "Saying the alphabet")
        shown(LearnerProfile(SchoolClass.NURSERY_2, AppLanguageSelection.ENGLISH))
        awaitListed("Saying the alphabet")
        openLesson("Saying the alphabet")
        val take = startTake()

        compose.activityRule.scenario.recreate()

        assertTrue(take.state.value.isRecording)
        assertEquals(1, recordings().size)
    }

    /** The child's answer, begun as the lesson's button begins it once the microphone is allowed. */
    private fun startTake(): CollectionViewModel {
        shadowOf(compose.activity.application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        ShadowAudioRecord.setSourceProvider(speaking)
        val take = requireNotNull(collection) { "The lesson has no recorder" }
        compose.runOnUiThread { take.startRecording(PracticeExercise.Planned("english.alphabet.say", "recitation", "alphabet")) }
        assertTrue(take.state.value.isRecording)
        return take
    }

    /** A child who keeps talking: loud, so the take never ends itself, and paced as a microphone is. */
    private val speaking = AudioRecordSourceProvider {
        object : ShadowAudioRecord.AudioRecordSource {
            override fun readInByteArray(audioData: ByteArray, offsetInBytes: Int, sizeInBytes: Int, isBlocking: Boolean): Int {
                Thread.sleep(READ_PACE_MS)
                for (index in offsetInBytes until offsetInBytes + sizeInBytes step 2) {
                    audioData[index] = 0
                    audioData[index + 1] = if (index / 2 % 2 == 0) LOUD else (-LOUD).toByte()
                }
                return sizeInBytes
            }
        }
    }

    private fun recordings() = context().filesDir.resolve(RECORDINGS_DIRECTORY).listFiles().orEmpty().toList()

    private fun openLesson(title: String) {
        listed(title).performClick()
        compose.waitForIdle()
    }

    private fun pressBack() {
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
    }

    private fun stored(schoolClass: SchoolClass, topic: String, planId: String, title: String) = runBlocking {
        database.lessonCacheDao().replaceCatalogue(
            ada,
            schoolClass.wireValue,
            listOf(
                CatalogueLessonEntity(
                    ownerId = ada,
                    learnerClass = schoolClass.wireValue,
                    planId = planId,
                    position = 0,
                    subject = planId.substringBefore('.'),
                    topic = topic,
                    titleJson = """{"en":"$title"}""",
                    standing = "untouched",
                    daysCorrect = 0,
                    current = true,
                    day = "2026-09-27",
                    fetchedAtEpochMillis = 1L,
                ),
            ),
        )
    }

    private fun shown(voice: LearnerProfile) {
        compose.setContent {
            LearnerScope(ada, viewModels) {
                GraspyTheme(InterfaceLanguage.ENGLISH) {
                    GraspyRoot(
                        copy = copyFor(InterfaceLanguage.ENGLISH),
                        appLanguage = AppLanguage.ENGLISH,
                        interfaceLanguage = InterfaceLanguage.ENGLISH,
                        voice = voice,
                        account = signedIn(ADA, deviceJoins = false),
                        menu = AccountMenu({}, {}, {}, {}),
                        onReplan = {},
                    )
                }
            }
        }
        settleMain(TIMEOUT_MS) { planViewModel?.state?.value is PlanState.Ready }
        compose.waitForIdle()
        settleMain(TIMEOUT_MS) { server.routesAsked.isNotEmpty() && learnerViews?.routes?.answers?.value?.isNotEmpty() == true }
        compose.waitForIdle()
    }

    /** A line of the lesson list: its rows are buttons, so their words sit below them in the tree. */
    private fun listed(text: String) = compose.onNodeWithText(text, useUnmergedTree = true)

    /** The stored lessons are read off the main thread. */
    private fun awaitListed(text: String) = compose.waitUntil(TIMEOUT_MS) {
        compose.onAllNodesWithText(text, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
        const val READ_PACE_MS = 20L
        const val LOUD: Byte = 0x60
    }
}
