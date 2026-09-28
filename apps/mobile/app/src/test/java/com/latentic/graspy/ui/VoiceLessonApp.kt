package com.latentic.graspy.ui

import android.Manifest
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.content.edit
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.work.Configuration
import androidx.work.WorkManager
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.PreferenceFiles
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
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.mcp.HOLDS_EVERY_FILE
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.mcp.LearnerViews
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.practice.ClassroomStep
import com.latentic.graspy.settleMain
import com.latentic.graspy.sync.CatalogueLessonEntity
import com.latentic.graspy.sync.LessonMoveEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowAudioRecord
import org.robolectric.shadows.ShadowAudioRecord.AudioRecordSourceProvider

typealias LessonRule = AndroidComposeTestRule<ActivityScenarioRule<ComponentActivity>, ComponentActivity>

/** The app signed in as Ada, against a fake graspy, drawn in [compose]: what the voice lesson tests drive. */
class VoiceLessonApp(private val compose: LessonRule) {
    val ada = learnerKey(UID, ADA.id)
    val server = FakeGraspyServer(PLAN.copy(system = "NG", level = "nursery-2"), LearnerRecord())
    private val database = inMemoryDatabase()
    private var planViewModel: PlanViewModel? = null
    private var learnerViews: LearnerViews? = null
    var collection: CollectionViewModel? = null
        private set
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

    fun open() {
        if (!WorkManager.isInitialized()) WorkManager.initialize(context(), Configuration.Builder().setExecutor { it.run() }.build())
        // The app's database outlives a test, so answers queued by another would be counted here.
        runBlocking { withContext(Dispatchers.IO) { AppGraph.database(context()).clearAllTables() } }
        // The note before a first voice lesson is not what these tests are about.
        AppGraph.account(context()).profiles.seeVoiceNote(ada)
    }

    fun close() {
        viewModels.keepOnly(null)
        database.close()
        server.web.shutdown()
    }

    fun stored(schoolClass: SchoolClass, topic: String, planId: String, title: String) = runBlocking {
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

    /**
     * The step the lesson opens on is the child's to answer: issued by the server and already said, as a step is
     * once the teacher's line has been heard.
     */
    fun yourTurn(schoolClass: SchoolClass) {
        val say = "plan.english.alphabet.say.practice"
        val move = LessonMoveEntity(
            ownerId = ada,
            learnerClass = schoolClass.wireValue,
            moveJson = """{"kind":"event","plan_id":"english.alphabet.say","event_id":"practice","event":"elicit_performance",
                "subject":"english","title":{"en":"Saying the alphabet"},"say":"$say","say_text":{"en":"Say it with me."},
                "activity":{"kind":"sequence","prompt_id":"$say","items":[{"id":"a","spoken":"A"},{"id":"b","spoken":"B"}]}}""",
            revision = 1L,
            day = "2026-09-28",
            // Fetched after any ask for a newer step, so it is the step the server issued.
            fetchedAtEpochMillis = Long.MAX_VALUE,
        )
        runBlocking { withContext(Dispatchers.IO) { AppGraph.database(context()).lessonCacheDao().saveLessonMove(move) } }
        val key = "$ada:${schoolClass.wireValue}:2026-09-28:1:$say"
        context().getSharedPreferences(PreferenceFiles.PLAYBACK, 0).edit(commit = true) {
            putBoolean("$key:started", true)
            putBoolean("$key:${ClassroomStep.YOUR_TURN.name}:heard", true)
        }
    }

    fun shown(voice: LearnerProfile) {
        compose.setContent { App(voice) }
        settleMain(TIMEOUT_MS) { planViewModel?.state?.value is PlanState.Ready }
        compose.waitForIdle()
        settleMain(TIMEOUT_MS) { server.routesAsked.isNotEmpty() && learnerViews?.routes?.answers?.value?.isNotEmpty() == true }
        compose.waitForIdle()
    }

    /** The phone turned: the activity is made again and draws the app again, as MainActivity does in onCreate. */
    fun turnPhone(voice: LearnerProfile) {
        compose.activityRule.scenario.recreate()
        compose.activityRule.scenario.onActivity { it.setContent { App(voice) } }
        compose.waitForIdle()
    }

    @Composable
    private fun App(voice: LearnerProfile) {
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

    /** A line of the lesson list: its rows are buttons, so their words sit below them in the tree. */
    fun listed(text: String) = compose.onNodeWithText(text, useUnmergedTree = true)

    /** The stored lessons are read off the main thread. */
    fun awaitListed(text: String) = compose.waitUntil(TIMEOUT_MS) {
        compose.onAllNodesWithText(text, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
    }

    fun openLesson(title: String) {
        listed(title).performClick()
        compose.waitForIdle()
    }

    fun pressBack() {
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
    }

    fun grantMicrophone(source: AudioRecordSourceProvider) {
        shadowOf(compose.activity.application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        ShadowAudioRecord.setSourceProvider(source)
    }

    fun answerButton() = compose.onNodeWithContentDescription(copyFor(InterfaceLanguage.ENGLISH).lesson.recordTable)

    fun queued() = runBlocking { AppGraph.database(context()).submissionDao().holdsAny(ada) }

    fun recordings() = context().filesDir.resolve(RECORDINGS_DIRECTORY).listFiles().orEmpty().toList()

    companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
