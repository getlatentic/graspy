package com.latentic.graspy.ui.tabs

import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.icons.Lucide
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** The web's tab bar: its four sections in order, their icons and words, and how the selected one looks. */
class TabBarTest {
    @Test
    fun `the tabs are the web's, in its order, with its icons`() {
        assertEquals(listOf(LearnTab.HOME, LearnTab.SUBJECTS, LearnTab.ASK, LearnTab.YOU), LearnTab.entries)
        assertEquals(listOf(Lucide.House, Lucide.BookOpen, Lucide.MessageCircle, Lucide.UserRound), LearnTab.entries.map { it.icon })
    }

    @Test
    fun `a class that learns by voice alone has Home and You, without the read tabs`() {
        assertEquals(LearnTab.entries, learnTabs(voiceOnly = false))
        assertEquals(listOf(LearnTab.HOME, LearnTab.YOU), learnTabs(voiceOnly = true))
    }

    @Test
    fun `each tab is named in the web's words in every language`() {
        val arabic = learnCopyFor(InterfaceLanguage.ARABIC).nav
        assertEquals(listOf("الرئيسية", "المواد", "اسأل", "أنت"), LearnTab.entries.map { it.label(arabic) })
        val yoruba = learnCopyFor(InterfaceLanguage.YORUBA).nav
        assertEquals(listOf("Ilé", "Kókó-ẹ̀kọ́", "Béèrè", "Ìwọ"), LearnTab.entries.map { it.label(yoruba) })
    }

    @Test
    fun `the selected tab is in accent ink, its icon heavier in a soft pill`() {
        val selected = tabLook(selected = true)

        assertEquals(GraspyColor.AccentInk, selected.ink)
        assertEquals(GraspyColor.AccentInk, selected.icon)
        assertEquals(GraspyColor.AccentSoft, selected.pill)
        assertEquals(2.25f, selected.stroke)
    }

    @Test
    fun `the others rest in subtle words and faint, lighter icons, with no pill`() {
        val resting = tabLook(selected = false)

        assertEquals(GraspyColor.Subtle, resting.ink)
        assertEquals(GraspyColor.Faint, resting.icon)
        assertEquals(GraspyColor.Surface, resting.pill)
        assertEquals(1.5f, resting.stroke)
        assertNotEquals(tabLook(selected = true), resting)
    }
}
