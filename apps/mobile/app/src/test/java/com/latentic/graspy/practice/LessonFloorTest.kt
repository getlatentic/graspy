package com.latentic.graspy.practice

import com.latentic.graspy.sync.MoveOrigin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LessonFloorTest {
    private val move = LessonMove(
        kind = LessonMove.EVENT,
        planId = "mathematics.multiplication.table-4",
        eventId = "recall",
        event = "stimulate_recall",
        say = "plan.mathematics.multiplication.table-4.recall",
    )

    private fun question(heard: Boolean = true) = ClassroomState(
        key = "key", move = move, step = ClassroomStep.YOUR_TURN, started = true, audioHeard = heard,
        origin = MoveOrigin.ISSUED,
    )

    private fun floor(
        classroom: ClassroomState = question(),
        voice: TeacherVoiceState = TeacherVoiceState.READY,
        recording: Boolean = false,
        saving: Boolean = false,
    ) = lessonFloor(classroom, voice, recording, saving)

    @Test
    fun `she keeps the floor while asking, even on a question the child has heard before`() {
        assertEquals(LessonFloor.TEACHER, floor(voice = TeacherVoiceState.SPEAKING))
    }

    @Test
    fun `fetching her line is already her turn, so the microphone never flashes up first`() {
        assertEquals(LessonFloor.TEACHER, floor(question(heard = false), voice = TeacherVoiceState.BUFFERING))
    }

    @Test
    fun `the turn passes to the child the moment her question ends`() {
        assertEquals(LessonFloor.CHILD, floor())
    }

    @Test
    fun `an unheard question is not the child's yet`() {
        assertEquals(LessonFloor.QUIET, floor(question(heard = false)))
    }

    @Test
    fun `an open microphone is the child speaking`() {
        assertEquals(LessonFloor.CHILD_SPEAKING, floor(recording = true))
    }

    @Test
    fun `a finished answer is being checked, never back to her speaker`() {
        assertEquals(LessonFloor.CHECKING, floor(saving = true))
        assertEquals(LessonFloor.CHECKING, floor(question().copy(step = ClassroomStep.SUBMITTING)))
    }

    @Test
    fun `a taught line she has finished can be heard again`() {
        val taught = question().copy(step = ClassroomStep.LEARN)

        assertEquals(LessonFloor.QUIET, floor(taught))
    }

    @Test
    fun `nothing loaded holds no floor`() {
        assertEquals(LessonFloor.NONE, floor(ClassroomState()))
    }

    @Test
    fun `the one button follows the turn`() {
        val classroom = question()

        assertEquals(TurnButton.STOP_TEACHER, turnButton(LessonFloor.TEACHER, classroom))
        assertEquals(TurnButton.RECORD, turnButton(LessonFloor.CHILD, classroom))
        assertEquals(TurnButton.FINISH, turnButton(LessonFloor.CHILD_SPEAKING, classroom))
        assertEquals(TurnButton.HEAR_AGAIN, turnButton(LessonFloor.QUIET, classroom.copy(step = ClassroomStep.LEARN)))
    }

    @Test
    fun `the button stays while an answer is checked, waiting instead of vanishing`() {
        assertEquals(TurnButton.WAIT, turnButton(LessonFloor.CHECKING, question()))
    }

    @Test
    fun `a step still waiting for the teacher cannot be replayed or answered yet`() {
        val cached = question().copy(step = ClassroomStep.LEARN, origin = MoveOrigin.CACHED)

        assertEquals(TurnButton.WAIT, turnButton(LessonFloor.QUIET, cached))
    }

    @Test
    fun `a kept step whose refresh failed offers to ask again rather than waiting forever`() {
        val stuck = question().copy(step = ClassroomStep.LEARN, origin = MoveOrigin.CACHED, refreshFailed = true)

        assertEquals(TurnButton.RETRY, turnButton(LessonFloor.QUIET, stuck))
    }

    @Test
    fun `loading waits and a failed load offers to ask again`() {
        assertEquals(TurnButton.WAIT, turnButton(LessonFloor.NONE, ClassroomState()))
        assertEquals(TurnButton.RETRY, turnButton(LessonFloor.NONE, ClassroomState(step = ClassroomStep.LOAD_FAILED)))
    }

    @Test
    fun `your turn is said as soon as her question ends, before the tap`() {
        assertEquals(TurnCue.YOUR_TURN, turnCue(LessonFloor.CHILD, TeacherVoiceState.READY))
        assertEquals(TurnCue.YOUR_TURN, turnCue(LessonFloor.CHILD_SPEAKING, TeacherVoiceState.READY))
    }

    @Test
    fun `her pill waits for sound, like her mouth`() {
        assertEquals(TurnCue.TEACHER_SPEAKING, turnCue(LessonFloor.TEACHER, TeacherVoiceState.SPEAKING))
        assertNull(turnCue(LessonFloor.TEACHER, TeacherVoiceState.BUFFERING))
    }

    @Test
    fun `checking and quiet moments carry no pill`() {
        assertNull(turnCue(LessonFloor.CHECKING, TeacherVoiceState.READY))
        assertNull(turnCue(LessonFloor.QUIET, TeacherVoiceState.READY))
    }
}
