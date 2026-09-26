package com.latentic.graspy.plan

import android.app.Application
import com.latentic.graspy.lesson.PLAN
import com.latentic.graspy.mcp.FakeGraspyServer
import com.latentic.graspy.settleMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** The plan's view model tells copies each record the server gives it, and never one it did not. */
@RunWith(RobolectricTestRunner::class)
class PlanViewModelTest {
    private val record = LearnerRecord(topics = listOf(TopicMark("mathematics", 1, "Fractions", lessonId = "lesson-9")))
    private val server = FakeGraspyServer(PLAN, record)
    private val application: Application = RuntimeEnvironment.getApplication()

    @After
    fun close() = server.web.shutdown()

    @Test
    fun `the record the server gives for the plan is told`() {
        val plans = PlanViewModel(application, server.calls)

        settleMain { plans.recordsRead.replayCache.isNotEmpty() }

        val told = plans.recordsRead.replayCache.single()
        assertEquals(PLAN.planId, told.plan.planId)
        assertEquals(record, told.record)
    }

    @Test
    fun `a record the server does not give is never told, though the plan is shown`() {
        server.recordFails = true
        val plans = PlanViewModel(application, server.calls)

        settleMain { plans.state.value is PlanState.Ready }

        assertEquals(emptyList<RecordRead>(), plans.recordsRead.replayCache)
    }
}
