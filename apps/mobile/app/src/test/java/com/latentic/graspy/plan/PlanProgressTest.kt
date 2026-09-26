package com.latentic.graspy.plan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The plan read as the web reads it: rows, the topic Home continues, and a lesson's target. */
class PlanProgressTest {
    private val maths = PlanSubject("Mathematics", "maths")
    private val physics = PlanSubject("Physics", "physics")
    private val plan = LearnerPlan(
        planId = "plan-1",
        country = "NG",
        countryName = "Nigeria",
        language = "en",
        gradeLevel = "JSS 1",
        subjects = listOf(maths, physics),
        topics = mapOf("maths" to listOf("Fractions", "Decimals", "Ratios"), "physics" to listOf("Motion", "Energy", "Quantum")),
        levels = mapOf("physics" to mapOf("Quantum" to "University")),
        goals = mapOf("physics" to "Quantum"),
    )
    private val record = LearnerRecord(
        topics = listOf(
            TopicMark("maths", 0, "Fractions", learntAt = 1),
            TopicMark("maths", 1, "Decimals", lessonId = "lesson-9"),
        ),
        answers = listOf(
            RecordedAnswer("maths", "practice", correct = true),
            RecordedAnswer("maths", "practice", correct = false),
            RecordedAnswer(null, "practice", correct = true),
            RecordedAnswer("maths", "lesson", correct = true),
        ),
    )
    private val marks = TopicMarks(record)

    @Test
    fun `each subject shows its next topic and how many are learnt`() {
        assertEquals(
            listOf(SubjectRow(maths, "Decimals", 1, 3), SubjectRow(physics, "Quantum", 0, 3)),
            subjectRows(plan, marks),
        )
    }

    @Test
    fun `a topic stands learnt, ready or not started`() {
        assertEquals(Standing.LEARNT, marks.standing("maths", 0, "Fractions"))
        assertEquals(Standing.READY, marks.standing("maths", 1, "Decimals"))
        assertEquals(Standing.NOT_STARTED, marks.standing("maths", 2, "Ratios"))
        assertEquals(Standing.NOT_STARTED, marks.standing("maths", 1, "Renamed"))
    }

    @Test
    fun `Home continues the subject the plan names next, then the one last studied, then the first`() {
        assertEquals(CurrentTopic(maths, 0, "Fractions", started = false), currentTopic(plan))
        assertEquals(CurrentTopic(physics, 2, "Quantum", started = false), currentTopic(plan.copy(assessment = Assessment("physics"))))
        val studying = plan.copy(activeSession = LearningSession("Physics", topicIndex = 1, phase = "practice"))
        assertEquals(CurrentTopic(physics, 1, "Energy", started = true), currentTopic(studying))
        assertNull(currentTopic(plan.copy(subjects = emptyList())))
    }

    @Test
    fun `a path goal's lesson recaps its unlearnt steps, at the goal's own level`() {
        val target = lessonTarget(plan, physics, 2, marks)!!

        assertEquals("University", target.gradeLevel)
        assertEquals(listOf("Motion", "Energy"), target.buildsOn)
        assertEquals(3, target.totalTopics)
        assertNull(lessonTarget(plan, maths, 1, marks)!!.buildsOn)
        assertNull(lessonTarget(plan, maths, 7, marks))
    }

    @Test
    fun `practice is tallied, outside a subject toward the total alone`() {
        val (total, bySubject) = practiceTally(record.answers)

        assertEquals(PracticeTally(3, 2), total)
        assertEquals(mapOf("maths" to PracticeTally(2, 1)), bySubject)
    }
}
