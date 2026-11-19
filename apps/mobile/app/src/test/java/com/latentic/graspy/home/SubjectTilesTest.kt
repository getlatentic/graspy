package com.latentic.graspy.home

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.latentic.graspy.plan.PlanSubject
import com.latentic.graspy.ui.AgeBand
import com.latentic.graspy.ui.GraspyTheme
import com.latentic.graspy.ui.LocalAgeBand
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Home's subject tiles show every subject's name and open it, for a learner of any band. */
@RunWith(RobolectricTestRunner::class)
class SubjectTilesTest {
    @get:Rule
    val compose = createComposeRule()

    private val maths = PlanSubject("Mathematics", "mathematics")
    private val unknown = PlanSubject("Yoruba Studies", "yoruba-studies")

    private fun check(band: AgeBand) {
        val opened = mutableListOf<PlanSubject>()
        compose.setContent {
            GraspyTheme {
                CompositionLocalProvider(LocalAgeBand provides band) { SubjectTiles(listOf(maths, unknown), opened::add) }
            }
        }
        compose.onNodeWithText("Mathematics").assertIsDisplayed().performClick()
        assertEquals(listOf(maths), opened)
        compose.onNodeWithText("Yoruba Studies").assertIsDisplayed()
    }

    @Test
    fun `a child sees the names and a tap opens the subject`() = check(AgeBand.Child)

    @Test
    fun `a tween sees the names and a tap opens the subject`() = check(AgeBand.Tween)

    @Test
    fun `a teen sees the names and a tap opens the subject`() = check(AgeBand.Teen)
}
