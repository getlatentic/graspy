package com.latentic.graspy.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class AgeBandTest {
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
        assert(ChildRadii.card > TweenRadii.card && TweenRadii.card > TeenRadii.card)
        assert(ChildRadii.control > TweenRadii.control && TweenRadii.control > TeenRadii.control)
    }
}
