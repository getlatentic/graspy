package com.latentic.graspy.account

import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.localization.LearnerProfileStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** What one learner did on this device never shows for another, whatever the device kept. */
@RunWith(RobolectricTestRunner::class)
class LearnerIsolationTest {
    private val database = inMemoryDatabase()
    private val answers = database.submissionDao()
    private val lessons = database.lessonCacheDao()
    private val ada = learnerKey(UID, ADA.id)
    private val bayo = learnerKey(UID, BAYO.id)

    @After
    fun close() = database.close()

    @Test
    fun `one learner's answers never show for another`() = runBlocking {
        answers.insert(answer("ada-1", ada))
        answers.insert(answer("bayo-1", bayo, SubmissionStatus.COMPLETED))

        assertEquals(listOf("ada-1"), answers.observeLessonTurns(ada).first().map { it.localId })
        assertEquals(listOf("bayo-1"), answers.observeLessonTurns(bayo).first().map { it.localId })
        assertEquals(listOf("ada-1"), answers.findIncomplete(ada).map { it.localId })
        assertEquals(emptyList<String>(), answers.findIncomplete(bayo).map { it.localId })
        assertEquals(1, answers.observeIncompleteCount(ada).first())
        assertEquals(0, answers.observeIncompleteCount(bayo).first())
    }

    @Test
    fun `an answer to a list asked again from where it broke is a lesson turn like any other`() = runBlocking {
        answers.insert(answer("plan-1", ada))
        answers.insert(answer("repair-1", ada, promptId = "repair.mathematics.time.days-of-the-week.practice.friday"))
        answers.insert(answer("echo-1", ada, promptId = "echo.mathematics.time.days-of-the-week.recall"))
        answers.insert(answer("probe-1", ada, promptId = "probe.mathematics.time.days-of-the-week.practice.friday"))
        answers.insert(answer("show-1", ada, promptId = "show.mathematics.time.days-of-the-week.practice.friday"))
        answers.insert(answer("other-1", ada, promptId = "mathematics.not-a-lesson"))

        assertEquals(
            listOf("echo-1", "plan-1", "probe-1", "repair-1", "show-1"),
            answers.observeLessonTurns(ada).first().map { it.localId },
        )
    }

    @Test
    fun `one learner's stored lessons and step never show for another`() = runBlocking {
        lessons.replaceCatalogue(ada, "primary_3", listOf(storedLesson(ada)))
        lessons.saveLessonMove(storedMove(ada))

        assertEquals(emptyList<String>(), lessons.observeCatalogue(bayo, "primary_3").first().map { it.planId })
        assertNull(lessons.observeLessonMove(bayo, "primary_3").first())

        lessons.replaceCatalogue(bayo, "primary_3", listOf(storedLesson(bayo, "everyday.days.week")))

        assertEquals(listOf("mathematics.table-2"), lessons.observeCatalogue(ada, "primary_3").first().map { it.planId })
        assertEquals(listOf("everyday.days.week"), lessons.observeCatalogue(bayo, "primary_3").first().map { it.planId })
    }

    @Test
    fun `the first learner chosen takes what the account kept before it held learners, and nothing of another account`() =
        runBlocking {
            answers.insert(answer("mine", UID, SubmissionStatus.COMPLETED))
            answers.insert(answer("another-account", "uid-2"))
            answers.insert(answer("before-owners", null))
            lessons.replaceCatalogue(UID, "primary_3", listOf(storedLesson(UID)))
            lessons.saveLessonMove(storedMove("uid-2"))
            val learning = DeviceLearning(database, LearnerProfileStore(context()))

            assertTrue(learning.holds(UID))
            learning.claim(UID, ada)

            assertFalse(learning.holds(UID))
            assertEquals(listOf("mine"), answers.observeLessonTurns(ada).first().map { it.localId })
            assertEquals(emptyList<String>(), answers.observeLessonTurns("uid-2").first().map { it.localId })
            assertEquals(listOf("mathematics.table-2"), lessons.observeCatalogue(ada, "primary_3").first().map { it.planId })
            assertNull(lessons.observeLessonMove("uid-2", "primary_3").first())
            assertFalse(answers.holdsAny("uid-2"))
        }
}
