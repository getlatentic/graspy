package com.latentic.graspy.ask

import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LearningPath
import com.latentic.graspy.plan.PathStep
import com.latentic.graspy.plan.PlanSubject
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The tutor's actions, carried out as the web carries them: what clears progress waits for the learner's yes. */
class PlanActionsTest {
    private val words = learnCopyFor(InterfaceLanguage.ENGLISH).chat
    private val plan = FakePlan(
        LearnerPlan(planId = "p", subjects = listOf(PlanSubject("Mathematics", "maths"), PlanSubject("Music", "music")), topics = mapOf("maths" to listOf("Fractions"))),
    )
    private val reports = Reports()
    private val actions = PlanActions(plan, words, reports) { 42 }

    @Test
    fun `dropping a subject waits for the learner, then drops it`() = runBlocking {
        actions.carryOut(TutorAction.ChangeSubjects(add = listOf("Art"), remove = listOf("Music")))

        assertEquals(PendingChange.ChangeSubjects(listOf("Mathematics", "Art"), listOf("Music")), reports.pending)
        assertTrue(plan.subjectChanges.isEmpty())

        actions.confirm(reports.pending!!)
        assertEquals(listOf(listOf("Mathematics", "Art")), plan.subjectChanges)
        assertEquals(words.subjectsChanged to ChatLink(words.seeSubjects, LinkTarget.Subjects), reports.done.single())
    }

    @Test
    fun `adding a subject alone needs no yes`() = runBlocking {
        actions.carryOut(TutorAction.ChangeSubjects(add = listOf("Art"), remove = emptyList()))

        assertNull(reports.pending)
        assertEquals(listOf(listOf("Mathematics", "Music", "Art")), plan.subjectChanges)
    }

    @Test
    fun `a rebuild waits for the learner, then rebuilds and sends them Home`() = runBlocking {
        actions.carryOut(TutorAction.RebuildPlan)
        assertEquals(PendingChange.Rebuild, reports.pending)
        assertEquals(0, plan.rebuilds)

        actions.confirm(PendingChange.Rebuild)
        assertEquals(1, plan.rebuilds)
        assertTrue(reports.rebuilt)
    }

    @Test
    fun `a topic is added at once, with a way to its lesson`() = runBlocking {
        actions.carryOut(TutorAction.AddTopic("maths", "Mathematics", "Ratios"))

        assertEquals(listOf("Fractions", "Ratios"), plan.plan.topicsOf("maths"))
        assertEquals(ChatLink(words.openLesson, LinkTarget.Lesson("maths", 1)), reports.done.single().second)
    }

    @Test
    fun `a path is planned, shown, and added only on the learner's yes`() = runBlocking {
        actions.carryOut(TutorAction.ProposePath("Calculus"))
        val proposal = reports.pending as PendingChange.Path
        assertEquals(PATH, proposal.path)
        assertTrue(plan.plan.subjects.none { it.slug == "calculus" })

        actions.confirm(proposal)
        assertEquals("calculus", plan.plan.subjects.last().slug)
        assertEquals(ChatLink(words.openLesson, LinkTarget.Lesson("calculus", 1)), reports.done.single().second)
    }

    @Test
    fun `opening a topic is a note with a link, and the chat never leaves on its own`() = runBlocking {
        actions.carryOut(TutorAction.OpenTopic("maths", 0, "Fractions"))

        assertEquals("“Fractions” is ready when you are." to ChatLink(words.openLesson, LinkTarget.Lesson("maths", 0)), reports.done.single())
    }

    private class FakePlan(override var plan: LearnerPlan) : PlanChanges {
        val subjectChanges = mutableListOf<List<String>>()
        var rebuilds = 0

        override suspend fun apply(next: LearnerPlan) = next.also { plan = it }

        override suspend fun changeSubjects(names: List<String>) {
            subjectChanges += names
        }

        override suspend fun planPath(goal: String) = PATH

        override fun rebuild(): Boolean {
            rebuilds += 1
            return true
        }
    }

    private class Reports : ActionReports {
        val done = mutableListOf<Pair<String, ChatLink?>>()
        var pending: PendingChange? = null
        var rebuilt = false

        override suspend fun done(text: String, link: ChatLink?) {
            done += text to link
        }

        override suspend fun failed(text: String) = error(text)

        override fun pending(change: PendingChange?) {
            pending = change
        }

        override fun changing(busy: Boolean) = Unit

        override fun rebuilt() {
            rebuilt = true
        }
    }

    private companion object {
        val PATH = LearningPath("Calculus", "Calculus", listOf(PathStep("Limits", "SS 2"), PathStep("Derivatives", "University")))
    }
}
