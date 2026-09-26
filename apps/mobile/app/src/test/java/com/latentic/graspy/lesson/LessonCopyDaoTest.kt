package com.latentic.graspy.lesson

import androidx.room.withTransaction
import com.latentic.graspy.account.inMemoryDatabase
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The copies as Room keeps them: one learner's are never another's to read or drop. */
@RunWith(RobolectricTestRunner::class)
class LessonCopyDaoTest {
    private val database = inMemoryDatabase()
    private val dao = database.lessonCopyDao()
    private val fractions = CopiedTopic("plan-1", "mathematics", 1, "Fractions")
    private val decimals = CopiedTopic("plan-1", "mathematics", 2, "Decimals")

    @After
    fun close() = database.close()

    @Test
    fun `a wipe waits for a copy whose learner was already checked, and takes it too`() {
        val checked = CountDownLatch(1)
        val release = CountDownLatch(1)
        val server = FakeLessonServer().apply { gives = lessonCard("ready") }
        val lessons = OfflineLessons(
            dao,
            "uid/ada",
            server,
            stillLearning = {
                checked.countDown()
                release.await(5, TimeUnit.SECONDS)
                true
            },
            inOneTransaction = { keep -> database.withTransaction { keep() } },
        )

        val opening = thread { runBlocking { lessons.openOrCopy(topic(0)) } }
        assertTrue(checked.await(5, TimeUnit.SECONDS))
        val wiping = thread { database.clearAllTables() }
        // Long enough for the wipe to reach the lock the copy's transaction holds.
        Thread.sleep(200)
        release.countDown()
        opening.join(5_000)
        wiping.join(5_000)

        assertEquals(emptyList<CopiedTopic>(), runBlocking { dao.copied("uid/ada") })
    }

    @Test
    fun `a learner reads only their own copy of a topic`() = runBlocking {
        keep("uid/ada", fractions, "ada's")
        keep("uid/bayo", fractions, "bayo's")

        assertEquals("ada's", card("uid/ada", fractions))
        assertEquals("bayo's", card("uid/bayo", fractions))
        assertNull(card("uid/tunde", fractions))
    }

    @Test
    fun `a learner lists only their own copies`() = runBlocking {
        keep("uid/ada", fractions, "ada's")
        keep("uid/bayo", decimals, "bayo's")

        assertEquals(listOf(fractions), dao.copied("uid/ada"))
        assertEquals(listOf(decimals), dao.copied("uid/bayo"))
    }

    @Test
    fun `dropping a learner's copies leaves another's of the same topic`() = runBlocking {
        keep("uid/ada", fractions, "ada's")
        keep("uid/ada", decimals, "ada's")
        keep("uid/bayo", fractions, "bayo's")

        dao.dropAll("uid/ada", listOf(fractions))

        assertEquals(listOf(decimals), dao.copied("uid/ada"))
        assertEquals("bayo's", card("uid/bayo", fractions))
    }

    @Test
    fun `keeping a topic again replaces its copy`() = runBlocking {
        keep("uid/ada", fractions, "first")
        keep("uid/ada", fractions, "second")

        assertEquals("second", card("uid/ada", fractions))
        assertEquals(listOf(fractions), dao.copied("uid/ada"))
    }

    private suspend fun keep(ownerId: String, topic: CopiedTopic, card: String) =
        dao.keep(LessonCopyEntity(ownerId, topic.planId, topic.subjectSlug, topic.topicIndex, topic.topic, card, savedAt = 1))

    private suspend fun card(ownerId: String, topic: CopiedTopic) =
        dao.card(ownerId, topic.planId, topic.subjectSlug, topic.topicIndex, topic.topic)
}
