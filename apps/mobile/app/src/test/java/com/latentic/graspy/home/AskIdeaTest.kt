package com.latentic.graspy.home

import com.latentic.graspy.ask.AskOpening
import com.latentic.graspy.ask.ChatTarget
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.plan.CurrentTopic
import com.latentic.graspy.plan.PlanSubject
import org.junit.Assert.assertEquals
import org.junit.Test

class AskIdeaTest {
    private val home = learnCopyFor(InterfaceLanguage.ENGLISH).home
    private val current = CurrentTopic(PlanSubject("Mathematics", "mathematics"), 2, "Fractions", started = true)

    @Test
    fun `explaining opens the general chat with nothing typed`() {
        assertEquals(AskOpening(ChatTarget.General, null), AskIdea.EXPLAIN.opening(home, current))
    }

    @Test
    fun `practice opens the chat of the topic Home continues, with the topic in the draft`() {
        assertEquals(
            AskOpening(ChatTarget.Topic("mathematics", 2), "Give me three practice questions on Fractions, one at a time."),
            AskIdea.PRACTISE.opening(home, current),
        )
    }

    @Test
    fun `practice with no topic yet opens the general chat`() {
        assertEquals(AskOpening(ChatTarget.General, home.practiseDraftAny), AskIdea.PRACTISE.opening(home, null))
    }

    @Test
    fun `a study plan is asked for in the general chat, whatever topic comes next`() {
        assertEquals(AskOpening(ChatTarget.General, home.planDraft), AskIdea.PLAN.opening(home, current))
    }
}
