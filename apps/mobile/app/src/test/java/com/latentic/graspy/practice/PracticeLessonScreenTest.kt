package com.latentic.graspy.practice

import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PracticeLessonScreenTest {
    private val copy = copyFor(InterfaceLanguage.ENGLISH)

    @Test
    fun `local silent recording explains how to retry`() {
        assertEquals(copy.lesson.noSpeech, recordingFailureMessage(copy, NO_SPEECH))
    }

    @Test
    fun `unrelated recording state has no failure message`() {
        assertNull(recordingFailureMessage(copy, null))
    }
}
