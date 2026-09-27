package com.latentic.graspy.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.work.Configuration
import androidx.work.WorkManager
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.account.learnerKey
import com.latentic.graspy.account.signedIn
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.HOLDS_EVERY_FILE
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.mcp.LearnerViews
import com.latentic.graspy.onboarding.DetailsFormViewModel
import com.latentic.graspy.onboarding.PlanSetupViewModel
import com.latentic.graspy.plan.Names
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.plan.SchoolLevel
import com.latentic.graspy.plan.SchoolStage
import com.latentic.graspy.plan.SchoolSystem
import com.latentic.graspy.settleMain
import java.util.concurrent.CopyOnWriteArrayList
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A new nursery learner's first plan, kept with no connection: the plan is not theirs until the server has it, so
 * onboarding says so and offers to try again, never a way back into the app with a plan the account lacks.
 */
@RunWith(RobolectricTestRunner::class)
// A phone in Nigeria, where the form looks first for the learner's class.
@Config(qualifiers = "en-rNG-w412dp-h915dp-xxhdpi")
class FirstPlanKeepTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val words = learnCopyFor(InterfaceLanguage.ENGLISH).onboarding
    private val ada = learnerKey(UID, ADA.id)
    private val database = inMemoryDatabase()
    private val server = PlanServer()
    private var planViewModel: PlanViewModel? = null
    private val voice = mutableStateOf<LearnerProfile?>(null)
    private val nigeria = SchoolSystem(
        id = "NG", country = "NG", name = Names("Nigeria"), main = true,
        stages = listOf(SchoolStage("early-childhood", Names("Early childhood"))),
        levels = listOf(SchoolLevel("nursery-1", "early-childhood", Names("Nursery 1"), listOf("N1"), 3, voiceOnly = true)),
    )
    private val viewModels = LearnerViewModels(
        LEARNER_VIEW_MODELS + mapOf(
            PlanViewModel::class.java to { app, key -> PlanViewModel(app, key, server.calls).also { planViewModel = it } },
            DetailsFormViewModel::class.java to { _, _ -> DetailsFormViewModel { country -> listOf(nigeria).filter { it.country == country } } },
            PlanSetupViewModel::class.java to { _, _ -> PlanSetupViewModel { _, _, _, _ -> null } },
            LearnerViews::class.java to { app, key -> LearnerViews(app, LearnerConnection(database, key, OkHttpClient(), server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }) },
        ),
    )

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
    fun `a first nursery plan the server did not keep offers no way back into the app, only to try again`() {
        shown()
        chooseClass("Nursery 1")

        compose.onNodeWithText(words.start).performClick()
        settleMain(TIMEOUT_MS) { server.keeps.isNotEmpty() && shows(words.generating.tryAgain) }

        compose.onNodeWithText(words.generating.failed).assertExists()
        compose.onNodeWithText(words.back).assertDoesNotExist()
        compose.onNodeWithText(words.steps.profile.title).assertExists()
    }

    @Test
    fun `once the server keeps it on a second try, the learner is in the app with that plan`() {
        shown()
        chooseClass("Nursery 1")
        compose.onNodeWithText(words.start).performClick()
        settleMain(TIMEOUT_MS) { shows(words.generating.tryAgain) }

        server.keepFails = false
        compose.onNodeWithText(words.generating.tryAgain).performClick()
        settleMain(TIMEOUT_MS) { server.keeps.size == 2 }
        settleMain(TIMEOUT_MS) { (planViewModel?.state?.value as? PlanState.Ready)?.plan?.level == "nursery-1" }
        settleMain(TIMEOUT_MS) { !shows(words.steps.profile.title) }

        assertEquals(2, server.keeps.size)
        compose.onNodeWithText(words.steps.profile.title).assertDoesNotExist()
    }

    private fun shown() {
        compose.setContent {
            LearnerScope(ada, viewModels) {
                GraspyTheme(InterfaceLanguage.ENGLISH) {
                    LearnerHome(
                        copy = copyFor(InterfaceLanguage.ENGLISH),
                        appLanguage = AppLanguage.ENGLISH,
                        interfaceLanguage = InterfaceLanguage.ENGLISH,
                        account = signedIn(ADA, deviceJoins = false),
                        learnerKey = ada,
                        voice = voice,
                        profiles = LearnerProfileStore(context()),
                        menu = AccountMenu({}, {}, {}, {}),
                        onWords = {},
                    )
                }
            }
        }
        settleMain(TIMEOUT_MS) { planViewModel?.state?.value == PlanState.None }
        compose.waitForIdle()
    }

    private fun chooseClass(className: String) {
        compose.onNodeWithContentDescription(words.profile.gradeLabel, substring = true).performScrollTo().performClick()
        compose.onNodeWithText(className).performClick()
    }

    private fun shows(text: String) = compose.onAllNodes(hasText(text)).fetchSemanticsNodes().isNotEmpty()

    /** graspy's API for a learner with no plan yet: keeping one fails while [keepFails], as it does offline; a kept one is read back. */
    private class PlanServer : Dispatcher() {
        var keepFails = true
        val keeps: MutableList<String> = CopyOnWriteArrayList()

        @Volatile private var held: String? = null
        val web = MockWebServer().also { it.dispatcher = this }

        val calls: Call.Factory = OkHttpClient().let { client ->
            Call.Factory { request ->
                client.newCall(request.newBuilder().url(request.url.newBuilder().scheme("http").host(web.hostName).port(web.port).build()).build())
            }
        }

        override fun dispatch(request: RecordedRequest): MockResponse = when (request.requestUrl?.encodedPath to request.method) {
            "/api/learner/curriculum" to "GET" -> json("""{"plan":${held ?: "null"}}""")
            "/api/learner/curriculum" to "PUT" -> kept(request.body.readUtf8())
            else -> MockResponse().setResponseCode(404)
        }

        private fun kept(body: String): MockResponse {
            keeps += body
            if (keepFails) return MockResponse().setResponseCode(503)
            held = body
            return json("""{"plan":$body}""")
        }

        private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
