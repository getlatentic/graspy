package com.latentic.graspy.practice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LessonStartTest {
    @Test
    fun `prefetch state does not disable the initial start action`() {
        assertTrue(lessonStartEnabled(startRequested = false))
    }

    @Test
    fun `a submitted start action cannot be submitted twice while audio is pending`() {
        assertFalse(lessonStartEnabled(startRequested = true))
    }
}
