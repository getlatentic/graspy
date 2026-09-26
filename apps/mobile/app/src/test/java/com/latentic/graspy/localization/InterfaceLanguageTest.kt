package com.latentic.graspy.localization

import androidx.compose.ui.unit.LayoutDirection
import com.latentic.graspy.ui.OnboardingStep
import com.latentic.graspy.ui.interfaceOptions
import com.latentic.graspy.ui.nextStep
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InterfaceLanguageTest {
    @Test
    fun `the layout reads right to left in Arabic, and left to right in every other language`() {
        assertEquals(LayoutDirection.Rtl, resolveInterfaceLanguage(InterfaceLanguage.ARABIC, "en-NG").layoutDirection)
        assertEquals(LayoutDirection.Rtl, resolveInterfaceLanguage(null, "ar-EG").layoutDirection)
        InterfaceLanguage.entries.filter { it != InterfaceLanguage.ARABIC }.forEach {
            assertEquals(it.name, LayoutDirection.Ltr, it.layoutDirection)
        }
    }

    @Test
    fun `the app's words follow the phone until they are chosen`() {
        assertEquals(InterfaceLanguage.ARABIC, resolveInterfaceLanguage(null, "ar-EG"))
        assertEquals(InterfaceLanguage.YORUBA, resolveInterfaceLanguage(null, "yo-NG"))
        assertEquals(InterfaceLanguage.ENGLISH, resolveInterfaceLanguage(null, "fr-FR"))
        assertEquals(InterfaceLanguage.PIDGIN, resolveInterfaceLanguage(InterfaceLanguage.PIDGIN, "ar-EG"))
    }

    @Test
    fun `an Arabic phone keeps lessons in a language the teacher speaks`() {
        assertEquals(AppLanguage.ENGLISH, resolveAppLanguage(AppLanguageSelection.SYSTEM, "ar-EG"))
    }

    @Test
    fun `the lesson language and the app's words are chosen one after the other, apart`() {
        assertEquals(OnboardingStep.LANGUAGE, nextStep(OnboardingStep.CLASS, askLanguage = true))
        assertEquals(OnboardingStep.INTERFACE, nextStep(OnboardingStep.LANGUAGE, askLanguage = true))
        assertNull(nextStep(OnboardingStep.INTERFACE, askLanguage = true))
        assertNull(nextStep(OnboardingStep.CLASS, askLanguage = false))
        val offered = interfaceOptions(copyFor(InterfaceLanguage.ENGLISH))
        assertEquals(listOf(null) + InterfaceLanguage.entries, offered.map { it.first })
        assertEquals("العربية", offered.last().second)
    }

    @Test
    fun `numbers are written in Western digits even on an Arabic phone`() {
        val phone = Locale.getDefault()
        Locale.setDefault(Locale.forLanguageTag("ar-EG"))
        try {
            assertEquals("سمعت 56. جرّب", "سمعت %d. جرّب".fillWith(56))
            assertEquals("7 من 12", "%1\$d من %2\$d".fillWith(7, 12))
        } finally {
            Locale.setDefault(phone)
        }
    }
}
