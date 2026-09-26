package com.latentic.graspy.learners

import org.junit.Assert.assertEquals
import org.junit.Test

class LearnerTileTest {
    @Test
    fun `a learner's face is the first letter of their name, as it is written`() {
        assertEquals("A", initialOf("  ada"))
        assertEquals("Ọ", initialOf("ọlá"))
        assertEquals("😀", initialOf("😀 Joy"))
        assertEquals("?", initialOf("   "))
    }
}
