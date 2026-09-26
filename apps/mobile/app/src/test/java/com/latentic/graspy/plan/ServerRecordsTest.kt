package com.latentic.graspy.plan

import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Test

/** Only a record the server gave is told to what copies lessons; every one is, even the same again. */
class ServerRecordsTest {
    private val plan = LearnerPlan(planId = "plan-1")
    private val record = LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9")))
    private val known = LearnerRecord(topics = listOf(TopicMark("mathematics", 0, "Number Systems", learntAt = 5)))
    private var answers: LearnerRecord? = record
    private var now = 10L
    private val records = ServerRecords({ now }) {
        // The answer comes after the asking: a copy kept meanwhile is newer than the record.
        now += 10
        answers
    }

    @Test
    fun `the server's record is used and told`() = runBlocking {
        val ready = records.ready(plan, known)

        assertEquals(record, ready.record)
        assertEquals(RecordRead(plan, record, askedAt = 10), withTimeout(TIMEOUT_MS) { records.read.first() })
    }

    @Test
    fun `with no answer, the known record is used and nothing is told`() = runBlocking {
        answers = null

        assertEquals(known, records.ready(plan, known).record)
        assertEquals(LearnerRecord(), records.ready(plan).record)
        assertEquals(emptyList<RecordRead>(), records.read.replayCache)
    }

    @Test
    fun `the same record read twice is told twice`() = runBlocking {
        val told = async(start = CoroutineStart.UNDISPATCHED) { records.read.take(2).toList() }
        records.ready(plan)
        records.ready(plan)

        assertEquals(2, withTimeout(TIMEOUT_MS) { told.await() }.size)
    }

    private companion object {
        const val TIMEOUT_MS = 5_000L
    }
}
