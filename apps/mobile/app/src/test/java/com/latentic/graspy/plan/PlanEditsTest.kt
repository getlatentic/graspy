package com.latentic.graspy.plan

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/** The plan's edits, as the web makes them: topics keyed by slug, progress kept where a subject stays. */
class PlanEditsTest {
    private val maths = PlanSubject("Mathematics", "maths")
    private val music = PlanSubject("Music", "music")
    private val plan = LearnerPlan(
        planId = "p", subjects = listOf(maths, music),
        topics = mapOf("maths" to listOf("Fractions"), "music" to listOf("Rhythm")),
        activeSession = LearningSession("Music", topicIndex = 0), assessment = Assessment("music"),
    )

    @Test
    fun `a new topic joins its subject, and one it has is found`() {
        val (added, index) = plan.withTopic("maths", " Ratios ", 7)!!
        assertEquals(listOf("Fractions", "Ratios"), added.topicsOf("maths"))
        assertEquals(1 to 7L, index to added.updatedAt)

        val (same, existing) = plan.withTopic("maths", "fractions", 7)!!
        assertSame(plan, same)
        assertEquals(0, existing)
        assertNull(plan.withTopic("physics", "Motion", 7))
    }

    @Test
    fun `dropping a subject drops its topics, session and place as next`() {
        val change = subjectChange(plan.subjects, namesAfter(plan.subjects, add = listOf("Art"), remove = listOf("Music")))
        assertEquals(listOf(music), change.removed)
        assertEquals(listOf("Art"), change.added)

        val next = plan.withSubjects(change.kept, listOf(PlanSubject("Art", "art")), mapOf("art" to listOf("Colour")), 9)
        assertEquals(listOf(maths, PlanSubject("Art", "art")), next.subjects)
        assertEquals(mapOf("maths" to listOf("Fractions"), "art" to listOf("Colour")), next.topics)
        assertNull(next.activeSession)
        assertEquals("maths", next.assessment?.nextSubject)
    }

    @Test
    fun `a removed subject's curriculum goes with it, and a kept one's stays`() {
        val source = buildJsonObject { put("authority", "NERDC") }
        val withSources = plan.copy(extras = buildJsonObject { put("sources", buildJsonObject { put("maths", source); put("science", source) }) })
        val next = withSources.withSubjects(listOf(maths), listOf(PlanSubject("Art", "art")), mapOf("art" to listOf("Colour")), 9)
        assertEquals(buildJsonObject { put("maths", source) }, next.extras["sources"])
    }

    @Test
    fun `a path becomes a subject of its own, each step at its level, ending at the goal`() {
        val path = LearningPath("Calculus", "Calculus", listOf(PathStep("Limits", "SS 2"), PathStep("Limits", "SS 2"), PathStep("Derivatives", "University")))
        val (next, subject) = plan.withPath(path, 3)

        assertEquals(PlanSubject("Calculus", "calculus"), subject)
        assertEquals(listOf("Limits", "Derivatives"), next.topicsOf("calculus"))
        assertEquals("University", next.topicLevel("calculus", "Derivatives"))
        assertEquals(1, next.goalIndex("calculus"))
        assertEquals(listOf(subject), next.paths())
        assertEquals(listOf("Mathematics", "Music"), next.rebuildSubjects())
    }
}
