package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LessonPhaseTest {
    private val idle = LessonSignals(
        lessonStarted = false,
        teacherVoice = TeacherVoiceState.READY,
        promptCompleted = false,
        recording = false,
        saving = false,
        submissionStatus = null,
        serverSampleId = null,
        hasOutcome = false,
        feedbackStarted = false,
        feedbackCompleted = false,
    )

    @Test
    fun `start lesson moves through teacher, learner, analysis and feedback phases`() {
        assertEquals(LessonPhase.PREVIEW, lessonPhase(idle))
        val started = idle.copy(lessonStarted = true, teacherVoice = TeacherVoiceState.BUFFERING)
        assertEquals(LessonPhase.TEACHER_BUFFERING, lessonPhase(started))
        assertEquals(LessonPhase.TEACHER_PLAYING, lessonPhase(started.copy(teacherVoice = TeacherVoiceState.SPEAKING)))
        val prompted = started.copy(teacherVoice = TeacherVoiceState.READY, promptCompleted = true)
        assertEquals(LessonPhase.LEARNER_READY, lessonPhase(prompted))
        assertEquals(LessonPhase.LEARNER_RECORDING, lessonPhase(prompted.copy(recording = true)))
        assertEquals(LessonPhase.UPLOADING, lessonPhase(prompted.copy(saving = true)))
        val queued = prompted.copy(submissionStatus = SubmissionStatus.UPLOADING)
        assertEquals(LessonPhase.UPLOADING, lessonPhase(queued))
        assertEquals(LessonPhase.ANALYSING, lessonPhase(queued.copy(serverSampleId = "gvm_1")))
        val evaluated = queued.copy(serverSampleId = "gvm_1", submissionStatus = SubmissionStatus.COMPLETED, hasOutcome = true)
        assertEquals(LessonPhase.FEEDBACK_BUFFERING, lessonPhase(evaluated))
        val speaking = evaluated.copy(feedbackStarted = true, teacherVoice = TeacherVoiceState.SPEAKING)
        assertEquals(LessonPhase.FEEDBACK_PLAYING, lessonPhase(speaking))
        assertEquals(LessonPhase.COMPLETE, lessonPhase(speaking.copy(teacherVoice = TeacherVoiceState.READY, feedbackCompleted = true)))
    }

    @Test
    fun `the learner cannot record while teacher audio plays`() {
        assertFalse(LessonPhase.TEACHER_BUFFERING.canRecord)
        assertFalse(LessonPhase.TEACHER_PLAYING.canRecord)
        assertFalse(LessonPhase.FEEDBACK_BUFFERING.canRecord)
        assertFalse(LessonPhase.FEEDBACK_PLAYING.canRecord)
        assertFalse(LessonPhase.UPLOADING.canRecord)
        assertFalse(LessonPhase.ANALYSING.canRecord)
        assertTrue(LessonPhase.LEARNER_READY.canRecord)
        assertTrue(LessonPhase.COMPLETE.canRecord)
    }

    @Test
    fun `a replayed prompt takes the microphone away again`() {
        val prompted = idle.copy(lessonStarted = true, promptCompleted = true, teacherVoice = TeacherVoiceState.SPEAKING)
        assertEquals(LessonPhase.TEACHER_PLAYING, lessonPhase(prompted))
    }

    @Test
    fun `a failed upload keeps the recording and offers to send it again`() {
        val failed = idle.copy(lessonStarted = true, promptCompleted = true, submissionStatus = SubmissionStatus.FAILED)
        assertEquals(LessonPhase.SEND_FAILED, lessonPhase(failed))
        assertTrue(LessonPhase.SEND_FAILED.canRecord)
        assertFalse(LessonPhase.SEND_FAILED.showsFeedback)
        assertEquals(copyFor(AppLanguage.ENGLISH).lesson.sendAgain, composerLabel(copyFor(AppLanguage.ENGLISH).lesson, LessonPhase.SEND_FAILED))
    }

    @Test
    fun `replaying any teacher audio after completion takes the microphone away`() {
        val complete = idle.copy(
            lessonStarted = true, promptCompleted = true, hasOutcome = true,
            feedbackStarted = true, feedbackCompleted = true, teacherVoice = TeacherVoiceState.SPEAKING,
        )
        assertEquals(LessonPhase.FEEDBACK_PLAYING, lessonPhase(complete))
        assertFalse(lessonPhase(complete).canRecord)
        assertEquals(LessonPhase.COMPLETE, lessonPhase(complete.copy(teacherVoice = TeacherVoiceState.READY)))
    }

    @Test
    fun `feedback audio failure does not trap the learner before the written result`() {
        val evaluated = idle.copy(lessonStarted = true, promptCompleted = true, hasOutcome = true, teacherVoice = TeacherVoiceState.FAILED)
        assertEquals(LessonPhase.COMPLETE, lessonPhase(evaluated))
    }

    @Test
    fun `the composer only offers recording in learner phases`() {
        val copy = copyFor(AppLanguage.ENGLISH).lesson
        assertEquals(null, composerLabel(copy, LessonPhase.TEACHER_PLAYING))
        assertEquals(null, composerLabel(copy, LessonPhase.ANALYSING))
        assertEquals(copy.recordTable, composerLabel(copy, LessonPhase.LEARNER_READY))
        assertEquals(copy.stopAndSend, composerLabel(copy, LessonPhase.LEARNER_RECORDING))
        assertEquals(copy.recordAgain, composerLabel(copy, LessonPhase.COMPLETE))
    }
}
