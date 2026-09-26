package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.sync.MoveOrigin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LessonMoveTest {
    private val present = apiJson.decodeFromString<LessonMove>(
        """{"kind":"event","plan_id":"mathematics.multiplication.table-2","event_id":"present","event":"present_content",
           "subject":"mathematics","title":{"en":"The two times table","yo":"Table two","pcm":"Table two"},
           "say":"plan.mathematics.multiplication.table-2.present",
           "say_text":{"en":"Two times three is six.","yo":"Two times three jẹ́ six.","pcm":"Two times three na six."},
           "show":{"en":"2 × 3 = 6","yo":"2 × 3 = 6","pcm":"2 × 3 = 6"},"activity":null,"reason":"start"}""",
    )

    @Test fun `a teacher-only event is a learn step that plays its own note and allows no answer`() {
        assertEquals(ClassroomStep.LEARN, present.firstStep())
        assertEquals(listOf("plan.mathematics.multiplication.table-2.present"), present.promptUtterances.map { it.wireValue })
        assertNull(present.exercise)
        assertEquals("Two times three jẹ́ six.", present.text(AppLanguage.YORUBA))
        assertEquals("Table two", present.titleText(AppLanguage.PIDGIN))
        assertEquals("2 × 3 = 6", present.showText(AppLanguage.ENGLISH))
        assertFalse(ClassroomState(move = present, step = ClassroomStep.LEARN, started = true, audioHeard = true).allowsAnswer)
        assertEquals("mathematics.multiplication.table-2" to "present", ClassroomState(move = present).planEvent)
    }

    @Test fun `an existing activity keeps its marker and a guidance event is said together`() {
        val guide = present.copy(eventId = "guide", event = "provide_guidance", activity = LessonActivity("existing", "mul_fact_2x3_say"))
        assertEquals(ClassroomStep.TOGETHER, guide.firstStep())
        assertEquals(PracticeExercise.FactAnswer(2, 3, taught = true), guide.exercise)
        val practice = guide.copy(event = "elicit_performance", activity = LessonActivity("existing", "mul_table_2_recite_1_12"))
        assertEquals(ClassroomStep.YOUR_TURN, practice.firstStep())
        val check = guide.copy(event = "assess_performance", activity = LessonActivity("existing", "mul_fact_2x7_answer"))
        assertEquals(ClassroomStep.QUICK_CHECK, check.firstStep())
        val ready = ClassroomState(move = check, step = ClassroomStep.QUICK_CHECK, started = true, audioHeard = true)
        assertTrue(ready.copy(origin = MoveOrigin.ISSUED).allowsAnswer)
        assertFalse(ready.copy(origin = MoveOrigin.CACHED).allowsAnswer)
    }

    @Test fun `a plan sequence is the plan's own exercise with the plan's subject as topic`() {
        val items = listOf(SequenceItemDto("monday", "Monday"), SequenceItemDto("tuesday", "Tuesday"))
        val days = present.copy(
            planId = "everyday.calendar.days-of-the-week", subject = "everyday", event = "elicit_performance",
            activity = LessonActivity("sequence", "plan.everyday.calendar.days-of-the-week.practice", items),
        )
        assertEquals(PracticeExercise.Planned("plan.everyday.calendar.days-of-the-week.practice", "recitation", "everyday"), days.exercise)
    }

    @Test fun `a plan missing the learner's language is a defect, not silent english`() {
        val broken = present.copy(sayText = mapOf("en" to "only english"))
        assertEquals("only english", broken.text(AppLanguage.ENGLISH))
        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) { broken.text(AppLanguage.YORUBA) }
    }

    @Test fun `a rest has no exercise and no plan event`() {
        val rest = apiJson.decodeFromString<LessonMove>("""{"kind":"rest","say":"finished","reason":"nothing is due today"}""")
        assertEquals(ClassroomStep.REST, rest.firstStep())
        assertNull(rest.exercise)
        assertNull(ClassroomState(move = rest).planEvent)
        assertFalse(ClassroomState(move = rest, step = ClassroomStep.REST, started = true, audioHeard = true).allowsAnswer)
    }

    @Test fun `learn and result never allow recording`() {
        for (step in listOf(ClassroomStep.LEARN, ClassroomStep.RESULT, ClassroomStep.LOAD_FAILED, ClassroomStep.SUBMITTING)) {
            assertFalse(ClassroomState(step = step, started = true, audioHeard = true).allowsAnswer)
        }
    }
}
