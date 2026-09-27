package com.latentic.graspy.ui

import androidx.compose.ui.test.junit4.createComposeRule
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.account.learnerKey
import com.latentic.graspy.account.signedIn
import com.latentic.graspy.lesson.CopiedLesson
import com.latentic.graspy.lesson.CopiedTopic
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.mcp.HOLDS_EVERY_FILE
import com.latentic.graspy.mcp.LearnerConnection
import com.latentic.graspy.mcp.LearnerViews
import com.latentic.graspy.plan.LearnerRecord
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.plan.TopicMark
import com.latentic.graspy.settleMain
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The learner's tabs, as the app shows them: the record the server gives when the plan loads reaches the
 * lessons, and its ready lesson is copied to the phone with nothing opened.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class LearnerTabsCopiesTest {
    @get:Rule
    val compose = createComposeRule()

    private val ada = learnerKey(UID, ADA.id)
    private val account = signedIn(ADA, deviceJoins = false)
    private val database = inMemoryDatabase()
    private val fractionsReady = LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9")))
    private val server = FakeGraspyServer(PLAN, fractionsReady)
    private val viewModels = LearnerViewModels(
        LEARNER_VIEW_MODELS + mapOf(
            PlanViewModel::class.java to { app, key -> PlanViewModel(app, key, server.calls) },
            LearnerViews::class.java to { app, key -> LearnerViews(app, LearnerConnection(database, key, OkHttpClient(), server.web.url("/mcp"), HOLDS_EVERY_FILE) { true }) },
        ),
    )

    @After
    fun close() {
        viewModels.keepOnly(null)
        database.close()
        server.web.shutdown()
    }

    @Test
    fun `the plan's ready lesson is copied once the tabs show, with nothing opened`() {
        val copy = copyFor(InterfaceLanguage.ENGLISH)
        compose.setContent {
            LearnerScope(ada, viewModels) {
                GraspyTheme(InterfaceLanguage.ENGLISH) {
                    LearnerTabs(
                        copy = copy,
                        learn = learnCopyFor(InterfaceLanguage.ENGLISH),
                        appLanguage = AppLanguage.ENGLISH,
                        interfaceLanguage = InterfaceLanguage.ENGLISH,
                        voice = null,
                        account = account,
                        menu = AccountMenu({}, {}, {}, {}),
                        onReplan = {},
                        openVoiceLesson = {},
                    )
                }
            }
        }

        settleMain(TIMEOUT_MS) { copied().isNotEmpty() }

        assertEquals(listOf(CopiedLesson(CopiedTopic(PLAN.planId, "mathematics", 1, "Fractions"), "lesson-9")), copied())
    }

    private fun copied() = runBlocking { database.lessonCopyDao().copied(ada) }

    private companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
