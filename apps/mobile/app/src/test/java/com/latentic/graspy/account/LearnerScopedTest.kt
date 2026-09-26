package com.latentic.graspy.account

import android.app.Application
import android.os.Looper
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkManager
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.home.HomeCatalogueViewModel
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.practice.PracticeLessonViewModel
import com.latentic.graspy.sync.lessonRefreshWorkName
import com.latentic.graspy.ui.LEARNER_VIEW_MODELS
import com.latentic.graspy.ui.LearnerScope
import com.latentic.graspy.ui.LearnerViewModels
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** A learner's view models belong to the learner of their scope, whoever the device learns as by then. */
@RunWith(RobolectricTestRunner::class)
class LearnerScopedTest {
    @get:Rule
    val compose = createComposeRule()

    private val application: Application = ApplicationProvider.getApplicationContext()
    private val work get() = WorkManager.getInstance(application)

    class Probe(application: Application, val learnerKey: String) : AndroidViewModel(application)

    @Before
    fun noLearnerOnTheDevice() {
        // The HTTP stack asks Firebase for sign-ins; the emulator's demo project stands in, as it does for the build.
        demoFirebase()
        if (!WorkManager.isInitialized()) WorkManager.initialize(application, Configuration.Builder().setExecutor { it.run() }.build())
        assertNull(AppGraph.account(application).learnerInUse())
    }

    @After
    fun signOut() = AppGraph.account(application).accounts.set(null)

    private fun deviceLearnsAs(learnerId: String) =
        AppGraph.account(application).accounts.set(Account("u", null, ChosenLearner(learnerId, learnerId), deviceJoins = false))

    @Test
    fun `a view model is made for the learner of its scope, not the device's, and anew for the next learner`() {
        deviceLearnsAs("tunde")
        val learner = mutableStateOf("u/ada")
        val made = mutableListOf<Probe>()
        val viewModels = LearnerViewModels(mapOf(Probe::class.java to ::Probe))
        compose.setContent {
            LearnerScope(learner.value, viewModels) {
                val probe: Probe = viewModel()
                if (made.lastOrNull() !== probe) made += probe
            }
        }
        compose.waitForIdle()
        learner.value = "u/bayo"
        compose.waitForIdle()

        assertEquals(listOf("u/ada", "u/bayo"), made.map { it.learnerKey })
        assertNotSame(made[0], made[1])
    }

    @Test
    fun `each listed maker makes the view model it is listed for`() {
        LEARNER_VIEW_MODELS.forEach { (listed, make) ->
            assertTrue(listed.simpleName, listed.isInstance(make(application, "u/ada")))
        }
    }

    @Test
    fun `a learner's view model left off the list fails, naming itself`() {
        val failure = runCatching {
            compose.setContent {
                LearnerScope("u/ada", LearnerViewModels(emptyMap())) { viewModel<Probe>() }
            }
            compose.waitForIdle()
        }.exceptionOrNull() ?: error("A learner's view model was made without its learner")
        assertTrue(failure.message.orEmpty(), failure.message.orEmpty().contains("Probe belongs to a learner"))
    }

    @Test
    fun `voice lessons ask for newer lessons for their own learner`() {
        deviceLearnsAs("ada")

        PracticeLessonViewModel(application, "u/ada").prepare(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)
        assertEquals(1, refreshesFor("u/ada"))
        forgetRefreshes("u/ada")

        HomeCatalogueViewModel(application, "u/ada").open(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)
        assertEquals(1, refreshesFor("u/ada"))
    }

    @Test
    fun `nothing starts for a learner the device has left, and nothing crashes`() {
        PracticeLessonViewModel(application, "u/ada").prepare(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)
        HomeCatalogueViewModel(application, "u/ada").open(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)

        assertEquals(0, refreshesFor("u/ada"))
    }

    @Test
    fun `nothing starts for a learner the device has left for another`() {
        deviceLearnsAs("tunde")

        PracticeLessonViewModel(application, "u/ada").prepare(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)
        HomeCatalogueViewModel(application, "u/ada").open(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)

        assertEquals(0, refreshesFor("u/ada"))
        assertEquals(0, refreshesFor("u/tunde"))
    }

    @Test
    fun `a plan read refused once the device has left the learner keeps nothing`() {
        val kept = application.getSharedPreferences(PreferenceFiles.PLAN, 0)
        kept.edit(commit = true) { putString("plan:u/ada", LearnerPlan(planId = "p").toJson().toString()) }
        val plan = PlanViewModel(application, "u/ada")
        kept.edit(commit = true) { clear() }

        // Refused on OkHttp's thread, the read settles on the main thread.
        val read = plan.refresh()
        val deadline = System.currentTimeMillis() + 5_000
        while (!read.isCompleted && System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(10)
        }

        assertTrue("the read never settled", read.isCompleted)
        assertTrue(plan.state.value is PlanState.Ready)
        assertEquals(emptyMap<String, Any?>(), kept.all)
    }

    private fun refreshesFor(learnerKey: String) = work.getWorkInfosForUniqueWork(lessonRefreshWorkName(learnerKey)).get().size

    private fun forgetRefreshes(learnerKey: String) {
        work.cancelUniqueWork(lessonRefreshWorkName(learnerKey)).result.get()
        work.pruneWork().result.get()
    }
}
