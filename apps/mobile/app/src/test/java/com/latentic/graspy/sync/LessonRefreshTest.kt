package com.latentic.graspy.sync

import androidx.work.BackoffPolicy
import androidx.work.NetworkType
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkInfo
import com.latentic.graspy.collection.outbox.UploadDisposition
import com.latentic.graspy.collection.outbox.UploadFailurePolicy
import com.latentic.graspy.localization.AppLanguage
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class LessonRefreshTest {
    private val request = LessonRefreshRequest("owner-1", "primary_3", AppLanguage.YORUBA)

    @Test
    fun `every trigger for one learner names the same work, so refreshes coalesce`() {
        val onOpen = lessonRefreshWorkName(request.ownerId)
        val afterAnswer = lessonRefreshWorkName(request.ownerId)
        val onClassChange = lessonRefreshWorkName(request.copy(learnerClass = "primary_4").ownerId)

        assertEquals(onOpen, afterAnswer)
        assertEquals(onOpen, onClassChange)
        assertFalse(onOpen == lessonRefreshWorkName("owner-2"))
    }

    @Test
    fun `a refresh waits for a network, backs off, and says it is worth expediting`() {
        val work = lessonRefreshWork(request).workSpec

        assertEquals(NetworkType.CONNECTED, work.constraints.requiredNetworkType)
        assertEquals(BackoffPolicy.EXPONENTIAL, work.backoffPolicy)
        assertTrue(work.expedited)
        assertEquals(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST, work.outOfQuotaPolicy)
        assertEquals("owner-1", work.input.getString(LessonRefreshWorker.OWNER_ID))
        assertEquals("primary_3", work.input.getString(LessonRefreshWorker.LEARNER_CLASS))
        assertEquals("YORUBA", work.input.getString(LessonRefreshWorker.LANGUAGE))
    }

    @Test
    fun `several coalesced attempts read as one refresh still running`() {
        assertEquals(RefreshState.RUNNING, refreshState(emptyList()))
        assertEquals(
            RefreshState.RUNNING,
            refreshState(listOf(WorkInfo.State.CANCELLED, WorkInfo.State.ENQUEUED)),
        )
        assertEquals(
            RefreshState.RUNNING,
            refreshState(listOf(WorkInfo.State.SUCCEEDED, WorkInfo.State.RUNNING)),
        )
        assertEquals(RefreshState.SUCCEEDED, refreshState(listOf(WorkInfo.State.SUCCEEDED)))
        assertEquals(RefreshState.FAILED, refreshState(listOf(WorkInfo.State.FAILED)))
        assertEquals(RefreshState.FAILED, refreshState(listOf(WorkInfo.State.CANCELLED)))
    }

    @Test
    fun `a step counts as issued only when it was fetched no earlier than the refresh being waited for`() {
        assertEquals(MoveOrigin.CACHED, moveOrigin(fetchedAtEpochMillis = 500L, refreshRequestedAtEpochMillis = 900L))
        assertEquals(MoveOrigin.ISSUED, moveOrigin(fetchedAtEpochMillis = 900L, refreshRequestedAtEpochMillis = 900L))
        assertEquals(MoveOrigin.ISSUED, moveOrigin(fetchedAtEpochMillis = 901L, refreshRequestedAtEpochMillis = 900L))
        assertEquals(MoveOrigin.CACHED, moveOrigin(fetchedAtEpochMillis = 900L, refreshRequestedAtEpochMillis = Long.MAX_VALUE))
    }

    @Test
    fun `a 409 means the step was never this learner's, so it is taken again rather than retried`() {
        assertTrue(stepWasNotOffered(httpError(409)))
        assertFalse(stepWasNotOffered(httpError(500)))
        assertEquals(UploadDisposition.PERMANENT_FAILURE, UploadFailurePolicy.forHttp(409, attemptIndex = 0))
        assertEquals(UploadDisposition.RETRY, UploadFailurePolicy.forHttp(503, attemptIndex = 0))
    }

    private fun httpError(code: Int) = HttpException(
        Response.error<Unit>(code, """{"detail":"that step was not offered to this learner"}"""
            .toResponseBody("application/json".toMediaType())),
    )
}
