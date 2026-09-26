package com.latentic.graspy.ui

import android.app.Application
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.HasDefaultViewModelProviderFactory
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.UID
import com.latentic.graspy.account.accountStore
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.account.learnerKey
import com.latentic.graspy.account.signedIn
import com.latentic.graspy.ask.AskViewModel
import com.latentic.graspy.lesson.CopiedTopic
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.mcp.FakeGraspyServer
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
import org.robolectric.RuntimeEnvironment
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

    private val application: Application = RuntimeEnvironment.getApplication()
    private val ada = learnerKey(UID, ADA.id)
    private val account = signedIn(ADA, deviceJoins = false).also { accountStore(it) }
    private val database = inMemoryDatabase()
    private val fractionsReady = LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9")))
    private val server = FakeGraspyServer(PLAN, fractionsReady)
    private val owner = LearnerModels(
        mapOf(
            PlanViewModel::class.java to { PlanViewModel(application, server.calls) },
            LearnerViews::class.java to {
                LearnerViews(application, LearnerConnection(database, ada, OkHttpClient(), server.web.url("/mcp")) { true })
            },
            AskViewModel::class.java to { AskViewModel(application) },
        ),
    )

    @After
    fun close() {
        owner.viewModelStore.clear()
        database.close()
        server.web.shutdown()
    }

    @Test
    fun `the plan's ready lesson is copied once the tabs show, with nothing opened`() {
        val copy = copyFor(InterfaceLanguage.ENGLISH)
        compose.setContent {
            CompositionLocalProvider(LocalViewModelStoreOwner provides owner) {
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

        assertEquals(listOf(CopiedTopic(PLAN.planId, "mathematics", 1, "Fractions")), copied())
    }

    private fun copied() = runBlocking { database.lessonCopyDao().copied(ada) }

    /** The learner's view models, each made as the test says rather than from the app's own server. */
    private class LearnerModels(private val makers: Map<Class<*>, () -> ViewModel>) : ViewModelStoreOwner, HasDefaultViewModelProviderFactory {
        override val viewModelStore = ViewModelStore()

        override val defaultViewModelProviderFactory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
                requireNotNull(makers[modelClass]) { "${modelClass.simpleName} is not made here" }() as T
        }
    }

    private companion object {
        const val TIMEOUT_MS = 10_000L
    }
}
