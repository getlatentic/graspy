package com.latentic.graspy.ui

import android.Manifest
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
import com.latentic.graspy.practice.PracticeLessonViewModel
import com.latentic.graspy.sync.CatalogueLessonEntity
import com.latentic.graspy.sync.LessonMoveEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowAudioRecord
import org.robolectric.shadows.ShadowAudioRecord.AudioRecordSourceProvider

typealias LessonRule = AndroidComposeTestRule<ActivityScenarioRule<ComponentActivity>, ComponentActivity>

/**
 * The compose rule the voice lesson tests drive. A screen's effects run only on the main thread, as the app's do:
 * by default a compose test runs them on an unconfined dispatcher, so a flow a screen collects, sent a value from a
 * worker thread, writes the screen's state on that worker, and Compose can find its layout read on two threads at once.
 * The effects then run only as the test moves the compose clock, which [VoiceLessonApp.settle] does.
 */
@OptIn(ExperimentalTestApi::class)
fun voiceLessonRule(): LessonRule = createAndroidComposeRule(ComponentActivity::class.java, StandardTestDispatcher())

/** The app signed in as Ada, against a fake graspy, drawn in [compose]: what the voice lesson tests drive. */
class VoiceLessonApp(private val compose: LessonRule) {
    val ada = learnerKey(UID, ADA.id)
    val server = FakeGraspyServer(PLAN.copy(system = "NG", level = "nursery-2"), LearnerRecord())
    private val database = inMemoryDatabase()
    private var planViewModel: PlanViewModel? = null
    private var learnerViews: LearnerViews? = null
    var collection: CollectionViewModel? = null
        private set
    private var lesson: PracticeLessonViewModel? = null
    private val viewModels = LearnerViewModels(
        LEARNER_VIEW_MODELS + mapOf(
            PlanViewModel::class.java to { app, key -> PlanViewModel(app, key, server.calls).also { planViewModel = it } },
            LearnerViews::class.java to { app, key ->
                LearnerViews(app, LearnerConnection(database, key, OkHttpClient(), server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }).also { learnerViews = it }
            },
            HomeCatalogueViewModel::class.java to { app, key -> HomeCatalogueViewModel(app, key, database.lessonCacheDao(), {}) { true } },
            CollectionViewModel::class.java to { app, key -> CollectionViewModel(app, key).also { collection = it } },
            PracticeLessonViewModel::class.java to { app, key -> PracticeLessonViewModel(app, key).also { lesson = it } },
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
                    titleJson = """{"en":"$title","yo":"$title","pcm":"$title"}""",
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
                "subject":"english","title":{"en":"Saying the alphabet","yo":"Saying the alphabet","pcm":"Saying the alphabet"},
                "say":"$say","say_text":{"en":"Say it with me.","yo":"Say it with me.","pcm":"Say it with me."},
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

    /** The learner's class and language, and the app language it resolves to, as the app draws them now. */
    private var learner by mutableStateOf<Pair<LearnerProfile, AppLanguage>?>(null)

    fun shown(voice: LearnerProfile, language: AppLanguage = AppLanguage.ENGLISH) {
        learner = voice to language
        compose.setContent { App() }
        settle { planViewModel?.state?.value is PlanState.Ready }
        settle { server.routesAsked.isNotEmpty() && learnerViews?.routes?.answers?.value?.isNotEmpty() == true }
    }

    /** The learner's language changes while the app is on screen, as a saved profile change reaches it. */
    fun learnAs(voice: LearnerProfile, language: AppLanguage = AppLanguage.ENGLISH) {
        compose.runOnUiThread { learner = voice to language }
    }

    /** The phone turned: the activity is made again and draws the app again, as MainActivity does in onCreate. */
    fun turnPhone(voice: LearnerProfile, language: AppLanguage = AppLanguage.ENGLISH) {
        learner = voice to language
        compose.activityRule.scenario.recreate()
        compose.activityRule.scenario.onActivity { it.setContent { App() } }
        settle { shows(answerButton()) || shows(finishButton()) }
    }

    @Composable
    private fun App() {
        val (voice, language) = learner ?: return
        LearnerScope(ada, viewModels) {
            GraspyTheme(InterfaceLanguage.ENGLISH) {
                GraspyRoot(
                    copy = copyFor(InterfaceLanguage.ENGLISH),
                    appLanguage = language,
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
    fun awaitListed(text: String) = settle { shows(listed(text)) }

    fun openLesson(title: String) {
        listed(title).performClick()
        settle { lesson?.chatOpen?.value == true && collection != null }
    }

    fun pressBack() {
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        settle { lesson?.chatOpen?.value == false }
    }

    /**
     * Runs the app until [done]: the main thread, and the screens' effects, which run as the compose clock moves.
     * Fails after [TIMEOUT_MS] rather than hanging.
     */
    fun settle(done: () -> Boolean) {
        val until = System.currentTimeMillis() + TIMEOUT_MS
        while (true) {
            compose.mainClock.advanceTimeByFrame()
            compose.waitForIdle()
            if (done()) return
            check(System.currentTimeMillis() < until) { "Still waiting after $TIMEOUT_MS ms" }
            Thread.sleep(POLL_MS)
        }
    }

    fun shows(node: SemanticsNodeInteraction) = runCatching { node.assertExists() }.isSuccess

    fun grantMicrophone(source: AudioRecordSourceProvider) {
        shadowOf(compose.activity.application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        ShadowAudioRecord.setSourceProvider(source)
    }

    fun answerButton() = compose.onNodeWithContentDescription(copyFor(InterfaceLanguage.ENGLISH).lesson.recordTable)

    /** The lesson's button while the child speaks: a tap sends what they said. */
    fun finishButton() = compose.onNodeWithContentDescription(copyFor(InterfaceLanguage.ENGLISH).lesson.stopAndSend)

    fun queued() = runBlocking { AppGraph.database(context()).submissionDao().holdsAny(ada) }

    /** The language pair and declared spoken language of each answer waiting to be sent, oldest first. */
    fun queuedLanguages() = runBlocking {
        AppGraph.database(context()).submissionDao().findIncomplete(ada).map { it.languagePair to it.spokenLanguage }
    }

    /** Whether anything on screen asks the phone to keep the screen on. */
    fun screenKeptOn(): Boolean {
        var kept = false
        compose.runOnUiThread { kept = compose.activity.window.decorView.keepsScreenOn() }
        return kept
    }

    private fun View.keepsScreenOn(): Boolean =
        keepScreenOn || (this is ViewGroup && (0 until childCount).any { getChildAt(it).keepsScreenOn() })

    fun recordings() = context().filesDir.resolve(RECORDINGS_DIRECTORY).listFiles().orEmpty().toList()

    companion object {
        const val TIMEOUT_MS = 10_000L
        private const val POLL_MS = 10L
    }
}
