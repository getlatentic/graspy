package com.latentic.graspy.ask

import com.latentic.graspy.plan.CurrentTopic
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.PlanSubject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Conversations kept per topic, found again by the plan, as the web's chat targets and directory find them. */
class ThreadScopeTest {
    private val maths = PlanSubject("Mathematics", "maths")
    private val art = PlanSubject("Art", "art")
    private val plan = LearnerPlan(planId = "plan-1", subjects = listOf(maths, art), topics = mapOf("maths" to listOf("Fractions", "Ratios")))
    private val current = CurrentTopic(maths, 0, "Fractions", started = false)

    private fun thread(scope: ThreadScope, updatedAt: Long) = ChatThread("t-$updatedAt", scope, null, null, 0, updatedAt)

    @Test
    fun `a topic's conversation keeps its topic even when the topics move`() {
        val scope = scopeOf(ChatTarget.Topic("maths", 1), plan)!!

        assertEquals(ThreadScope.Topic("plan-1", "maths", "Ratios"), scope)
        val moved = plan.copy(topics = mapOf("maths" to listOf("Ratios", "Fractions")))
        assertEquals(ChatTarget.Topic("maths", 0), targetOf(scope, moved))
    }

    @Test
    fun `a conversation from another plan, or about a topic gone from it, is not offered`() {
        assertNull(targetOf(ThreadScope.Topic("plan-0", "maths", "Ratios"), plan))
        assertNull(targetOf(ThreadScope.Topic("plan-1", "maths", "Algebra"), plan))
        assertNull(targetOf(ThreadScope.Subject("plan-1", "physics"), plan))
        assertNull(scopeOf(ChatTarget.Topic("maths", 9), plan))
    }

    @Test
    fun `Ask opens the latest conversation the plan still holds, else the topic Home continues`() {
        val old = thread(ThreadScope.Topic("plan-0", "maths", "Ratios"), 9)
        val subject = thread(ThreadScope.Subject("plan-1", "art"), 5)

        assertEquals(ChatTarget.Subject("art"), latestChat(listOf(old, subject), plan, current))
        assertEquals(ChatTarget.Topic("maths", 0), latestChat(listOf(old), plan, current))
        assertEquals(ChatTarget.General, latestChat(emptyList(), plan, null))
    }

    @Test
    fun `changing the conversation offers the current topic, recent ones and anything, never the open one`() {
        val ratios = thread(ThreadScope.Topic("plan-1", "maths", "Ratios"), 3)
        val general = thread(ThreadScope.General("plan-1"), 2)
        val directory = chatDirectory(listOf(ratios, general), plan, current, open = ratios.scope)

        assertEquals(current to ChatTarget.Topic("maths", 0), directory.topic)
        assertEquals(emptyList<Pair<ChatThread, ChatTarget>>(), directory.recent)
        assertEquals(general, directory.anything)

        val fromFractions = chatDirectory(listOf(ratios, general), plan, current, open = ThreadScope.Topic("plan-1", "maths", "Fractions"))
        assertNull(fromFractions.topic)
        assertEquals(listOf(ratios to ChatTarget.Topic("maths", 1)), fromFractions.recent)
        assertEquals(false, chatDirectory(emptyList(), plan, current, open = general.scope).offerAnything)
    }

    @Test
    fun `questions the tutor never read are sent again with the next`() {
        fun message(kind: MessageKind, text: String) = ChatMessage(text, "t", kind, text, 0)
        val messages = listOf(message(MessageKind.LEARNER, "a"), message(MessageKind.TUTOR, "b"), message(MessageKind.LEARNER, "c"), message(MessageKind.FAILED, "x"), message(MessageKind.LEARNER, "d"))

        assertEquals(listOf("c", "d"), unansweredIn(messages))
    }
}
