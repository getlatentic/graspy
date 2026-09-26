package com.latentic.graspy.practice

import com.latentic.graspy.sync.MoveOrigin
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Worker credits progress to the step it issued, so a step kept on the phone may be read and
 * heard while a refresh runs, and answered only once that refresh has brought it back.
 */
class ClassroomAnswerTest {
    private val move = LessonMove(
        kind = LessonMove.EVENT,
        planId = "everyday.days.week",
        eventId = "practise",
        event = "elicit_performance",
        say = "plan.everyday.days.week.practise",
    )

    private fun classroom(step: ClassroomStep, origin: MoveOrigin) = ClassroomState(
        key = "key", move = move, step = step, started = true, audioHeard = true, origin = origin,
    )

    @Test
    fun `a step kept from an earlier sitting is shown but not answered`() {
        val cached = classroom(ClassroomStep.YOUR_TURN, MoveOrigin.CACHED)

        assertFalse(cached.allowsAnswer)
        assertTrue(cached.waitingForTeacher)
    }

    @Test
    fun `the same step is answerable once the refresh has issued it again`() {
        val issued = classroom(ClassroomStep.YOUR_TURN, MoveOrigin.ISSUED)

        assertTrue(issued.allowsAnswer)
        assertFalse(issued.waitingForTeacher)
    }

    @Test
    fun `moving past a taught step tells the worker, so it waits for the refresh too`() {
        assertFalse(classroom(ClassroomStep.LEARN, MoveOrigin.CACHED).allowsContinue)
        assertTrue(classroom(ClassroomStep.LEARN, MoveOrigin.CACHED).waitingForTeacher)
        assertTrue(classroom(ClassroomStep.LEARN, MoveOrigin.ISSUED).allowsContinue)
    }

    @Test
    fun `a result is the learner's own, so it is acknowledged with no network at all`() {
        val result = ClassroomState(key = "turn-1", step = ClassroomStep.RESULT, started = true, audioHeard = true)

        assertTrue(result.allowsContinue)
        assertFalse(result.waitingForTeacher)
    }

    @Test
    fun `nothing is answerable before the learner has started and heard the step`() {
        val unheard = classroom(ClassroomStep.QUICK_CHECK, MoveOrigin.ISSUED).copy(audioHeard = false)

        assertFalse(unheard.allowsAnswer)
        assertFalse(unheard.allowsContinue)
        assertFalse(unheard.waitingForTeacher)
    }
}
