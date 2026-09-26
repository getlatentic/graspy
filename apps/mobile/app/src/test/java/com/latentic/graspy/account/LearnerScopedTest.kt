package com.latentic.graspy.account

import android.app.Application
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkManager
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.home.HomeCatalogueViewModel
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.practice.PracticeLessonViewModel
import com.latentic.graspy.ui.LearnerScope
import com.latentic.graspy.ui.LearnerViewModels
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A learner's view models belong to the learner of their scope, whoever the device learns as by then. */
@RunWith(RobolectricTestRunner::class)
class LearnerScopedTest {
    @get:Rule
    val compose = createComposeRule()

    private val application: Application = ApplicationProvider.getApplicationContext()

    class Probe(application: Application, val learnerKey: String) : AndroidViewModel(application) {
        companion object {
            val Factory = learnerViewModelFactory(::Probe)
        }
    }

    @Before
    fun noLearnerOnTheDevice() {
        // The HTTP stack asks Firebase for sign-ins; the emulator's demo project stands in, as it does for the build.
        if (FirebaseApp.getApps(application).isEmpty()) {
            FirebaseApp.initializeApp(application, FirebaseOptions.Builder().setProjectId("demo-graspy").setApplicationId("1:0:android:0").setApiKey("demo-key").build())
        }
        if (!WorkManager.isInitialized()) WorkManager.initialize(application, Configuration.Builder().setExecutor { it.run() }.build())
        assertNull(AppGraph.account(application).learnerInUse())
    }

    @Test
    fun `a view model is made for the learner of its scope, and anew for the next learner`() {
        val learner = mutableStateOf("account:u/ada")
        val made = mutableListOf<Probe>()
        val viewModels = LearnerViewModels()
        compose.setContent {
            LearnerScope(learner.value, viewModels) {
                val probe: Probe = viewModel(factory = Probe.Factory)
                if (made.lastOrNull() !== probe) made += probe
            }
        }
        compose.waitForIdle()
        learner.value = "account:u/tunde"
        compose.waitForIdle()

        assertEquals(listOf("account:u/ada", "account:u/tunde"), made.map { it.learnerKey })
        assertNotSame(made[0], made[1])
    }

    @Test
    fun `voice lessons open for their learner after the device has left them`() {
        val lesson = PracticeLessonViewModel(application, "account:u/ada")
        lesson.prepare(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)

        val home = HomeCatalogueViewModel(application, "account:u/ada")
        home.open(AppLanguage.ENGLISH, SchoolClass.PRIMARY_4)
    }
}
