package com.latentic.graspy.localization

import androidx.compose.ui.unit.LayoutDirection
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class InterfaceLanguageTest {
    @Test
    fun `the layout reads right to left in Arabic, and left to right in every other language`() {
        assertEquals(LayoutDirection.Rtl, resolveInterfaceLanguage(InterfaceLanguage.ARABIC, AppLanguage.YORUBA, "en-NG").layoutDirection)
        assertEquals(LayoutDirection.Rtl, resolveInterfaceLanguage(null, null, "ar-EG").layoutDirection)
        InterfaceLanguage.entries.filter { it != InterfaceLanguage.ARABIC }.forEach {
            assertEquals(it.name, LayoutDirection.Ltr, it.layoutDirection)
        }
    }

    @Test
    fun `the app's words follow the learner's lessons until other words are chosen`() {
        assertEquals(InterfaceLanguage.YORUBA, resolveInterfaceLanguage(null, AppLanguage.YORUBA, "en-NG"))
        assertEquals(InterfaceLanguage.PIDGIN, resolveInterfaceLanguage(null, AppLanguage.PIDGIN, "ar-EG"))
        assertEquals(InterfaceLanguage.ARABIC, resolveInterfaceLanguage(InterfaceLanguage.ARABIC, AppLanguage.YORUBA, "en-NG"))
    }

    @Test
    fun `before there is a learner the app's words follow the phone`() {
        assertEquals(InterfaceLanguage.ARABIC, resolveInterfaceLanguage(null, null, "ar-EG"))
        assertEquals(InterfaceLanguage.YORUBA, resolveInterfaceLanguage(null, null, "yo-NG"))
        assertEquals(InterfaceLanguage.ENGLISH, resolveInterfaceLanguage(null, null, "fr-FR"))
    }

    @Test
    fun `an Arabic phone keeps lessons in a language the teacher speaks`() {
        assertEquals(AppLanguage.ENGLISH, resolveAppLanguage(AppLanguageSelection.SYSTEM, "ar-EG"))
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
