package com.latentic.graspy.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Dp
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AgeBandTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the age in the class decides the band`() {
        assertEquals(AgeBand.Child, ageBandOf("primary-3", "Standard 3, Kenya, age 9"))
        assertEquals(AgeBand.Tween, ageBandOf("primary-8", "Standard 8 (Primary), Kenya, age 13"))
        assertEquals(AgeBand.Tween, ageBandOf("jss-1", "JSS 1 (Junior Secondary School), Nigeria, age 12"))
        assertEquals(AgeBand.Teen, ageBandOf("ss-2", "SS 2 (Senior Secondary), Nigeria, age 16"))
    }

    @Test
    fun `a learner after school is a teen whatever the descriptor says`() {
        assertEquals(AgeBand.Teen, ageBandOf("undergraduate", ""))
        assertEquals(AgeBand.Teen, ageBandOf("graduate", "Graduate student, studying Law"))
    }

    @Test
    fun `a class that names no age is a child`() {
        assertEquals(AgeBand.Child, ageBandOf("class-5", "Class 5"))
        assertEquals(AgeBand.Child, ageBandOf(null, ""))
    }

    @Test
    fun `the radii follow the band and are the tween look until the class is known`() {
        assertSame(ChildRadii, radiiFor(AgeBand.Child))
        assertSame(TweenRadii, radiiFor(AgeBand.Tween))
        assertSame(TeenRadii, radiiFor(AgeBand.Teen))
        assertSame(TweenRadii, radiiFor(null))
    }

    @Test
    fun `a younger learner has rounder cards and buttons`() {
        assertTrue(ChildRadii.card > TweenRadii.card && TweenRadii.card > TeenRadii.card)
        assertTrue(ChildRadii.control > TweenRadii.control && TweenRadii.control > TeenRadii.control)
    }

    @Test
    fun `GraspyRadius reads the band the learner's screens are given`() {
        var seen: Pair<Dp, Dp>? = null
        compose.setContent {
            CompositionLocalProvider(LocalGraspyRadii provides ChildRadii) { seen = GraspyRadius.Card to GraspyRadius.Control }
        }
        compose.waitForIdle()
        assertEquals(ChildRadii.card to ChildRadii.control, seen)
    }
}
