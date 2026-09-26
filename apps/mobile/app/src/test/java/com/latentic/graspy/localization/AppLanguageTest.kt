package com.latentic.graspy.localization

import org.junit.Assert.assertEquals
import org.junit.Test

class AppLanguageTest {
    @Test
    fun `phone language is used until the learner chooses an override`() {
        assertEquals(AppLanguage.YORUBA, resolveAppLanguage(AppLanguageSelection.SYSTEM, "yo-NG"))
        assertEquals(AppLanguage.PIDGIN, resolveAppLanguage(AppLanguageSelection.SYSTEM, "pcm-NG"))
        assertEquals(AppLanguage.ENGLISH, resolveAppLanguage(AppLanguageSelection.SYSTEM, "fr-FR"))
    }

    @Test
    fun `explicit choice wins over the phone language`() {
        assertEquals(AppLanguage.PIDGIN, resolveAppLanguage(AppLanguageSelection.PIDGIN, "yo-NG"))
    }
}
