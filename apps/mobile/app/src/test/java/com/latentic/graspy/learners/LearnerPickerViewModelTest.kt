package com.latentic.graspy.learners

import android.app.Application
import com.latentic.graspy.account.ADA
import com.latentic.graspy.account.BAYO
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.account.LearnerPicks
import com.latentic.graspy.account.UnsentChanges
import com.latentic.graspy.settleMain
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** "Who's learning?" adds a new learner once, whether or not the switch to them goes through. */
@RunWith(RobolectricTestRunner::class)
class LearnerPickerViewModelTest {
    private val application: Application = RuntimeEnvironment.getApplication()
    private val picks = FakePicks()
    private val picker = LearnerPickerViewModel(application, picks)
    private var chosen = 0

    @Test
    fun `a learner added, whose switch stops at what is unsent, closes the form and is never added again`() {
        picks.unsent = true
        picker.startAdding()

        picker.addAndChoose("Bayo") { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.UNSENT, picker.state.value.problem)
        assertFalse(picker.state.value.adding)
        picker.anyway { chosen += 1 }
        settleMain { chosen == 1 }
        assertEquals(listOf("Bayo"), picks.added)
        assertEquals(listOf(BAYO to false, BAYO to true), picks.chosen)
    }

    @Test
    fun `a learner added and switched to closes the form`() {
        picker.startAdding()

        picker.addAndChoose("Bayo") { chosen += 1 }
        settleMain { chosen == 1 }

        assertFalse(picker.state.value.adding)
        assertEquals(listOf("Bayo"), picks.added)
    }

    @Test
    fun `an add graspy did not make keeps the form open to try again`() {
        picks.addFails = true
        picker.startAdding()

        picker.addAndChoose("Bayo") { chosen += 1 }
        settleMain { picker.state.value.problem != null }

        assertEquals(ChoiceProblem.FAILED, picker.state.value.problem)
        assertTrue(picker.state.value.adding)
        assertTrue(picks.chosen.isEmpty())
    }

    @Test
    fun `a learner already on the account is chosen without an add`() {
        picker.choose(ADA) { chosen += 1 }
        settleMain { chosen == 1 }

        assertTrue(picks.added.isEmpty())
        assertEquals(listOf(ADA to false), picks.chosen)
    }

    private class FakePicks : LearnerPicks {
        var unsent = false
        var addFails = false
        val added = mutableListOf<String>()
        val chosen = mutableListOf<Pair<LearnerDto, Boolean>>()

        override suspend fun add(name: String): LearnerDto {
            if (addFails) throw IOException("graspy could not be reached")
            added += name
            return BAYO
        }

        override suspend fun choose(learner: LearnerDto, loseUnsent: Boolean) {
            chosen += learner to loseUnsent
            if (unsent && !loseUnsent) throw UnsentChanges(offline = false)
        }
    }
}
