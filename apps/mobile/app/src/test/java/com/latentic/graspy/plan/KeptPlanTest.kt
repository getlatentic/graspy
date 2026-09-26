package com.latentic.graspy.plan

import android.app.Application
import androidx.core.content.edit
import androidx.test.core.app.ApplicationProvider
import com.latentic.graspy.account.PreferenceFiles
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The plan kept on the phone is one learner's: never read as another's, never written once they have gone. */
@RunWith(RobolectricTestRunner::class)
class KeptPlanTest {
    private val preferences = ApplicationProvider.getApplicationContext<Application>().getSharedPreferences(PreferenceFiles.PLAN, 0)
    private val adas = PlanState.Ready(LearnerPlan(planId = "adas-plan"), LearnerRecord())
    private var adaLearning = true
    private val ada = KeptPlan(preferences, "u/ada") { adaLearning }
    private val tunde = KeptPlan(preferences, "u/tunde") { true }

    @Test
    fun `a learner's kept plan is theirs alone`() {
        ada.keep(adas)

        assertEquals("adas-plan", ada.read()?.plan?.planId)
        assertNull(tunde.read())
    }

    @Test
    fun `nothing is kept once the device has left the learner`() {
        adaLearning = false

        ada.keep(adas)

        assertNull(ada.read())
        assertEquals(emptyMap<String, Any?>(), preferences.all)
    }

    @Test
    fun `an older version's unowned plan is never read, and goes as soon as a kept plan is opened`() {
        preferences.edit(commit = true) {
            putString("plan", LearnerPlan(planId = "whose").toJson().toString())
            putString("record", "{}")
        }

        val opened = KeptPlan(preferences, "u/tunde") { true }

        assertNull(opened.read())
        assertEquals(emptySet<String>(), preferences.all.keys)
    }
}
