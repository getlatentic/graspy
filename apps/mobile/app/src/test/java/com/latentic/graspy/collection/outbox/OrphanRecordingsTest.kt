package com.latentic.graspy.collection.outbox

import com.latentic.graspy.account.answer
import com.latentic.graspy.account.context
import com.latentic.graspy.account.inMemoryDatabase
import com.latentic.graspy.collection.RECORDINGS_DIRECTORY
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A take left by a process that died while the child spoke is removed at the next start, and so is the recording of an
 * answer already marked or given up on; a recording still waiting to be sent is not.
 */
@RunWith(RobolectricTestRunner::class)
class OrphanRecordingsTest {
    private val database = inMemoryDatabase()
    private val dao = database.submissionDao()
    private val recordings = File(context().filesDir, RECORDINGS_DIRECTORY).apply { mkdirs() }
    private val startedAt = 1_800_000_000_000L

    @After
    fun close() {
        database.close()
        recordings.deleteRecursively()
    }

    private fun recording(name: String, writtenAt: Long) =
        File(recordings, "$name.wav").apply {
            writeBytes(ByteArray(44))
            setLastModified(writtenAt)
        }

    @Test
    fun `a take no answer holds, written before this process started, is removed`() = runBlocking {
        val orphan = recording("orphan", writtenAt = startedAt - 60_000)

        sweepOrphanRecordings(dao, recordings, startedAt)

        assertFalse(orphan.exists())
    }

    @Test
    fun `a recording an answer waiting to be sent holds is kept, whoever the answer belongs to`() = runBlocking {
        val held = recording("held", writtenAt = startedAt - 60_000)
        val heldByAnother = recording("held-by-another", writtenAt = startedAt - 60_000)
        dao.insert(answer("mine", ownerId = "uid/ada").copy(audioPath = held.path))
        dao.insert(answer("theirs", ownerId = "uid/grace").copy(audioPath = heldByAnother.path))

        sweepOrphanRecordings(dao, recordings, startedAt)

        assertTrue(held.exists())
        assertTrue(heldByAnother.exists())
    }

    @Test
    fun `the recording of an answer already marked or given up on is removed`() = runBlocking {
        val marked = recording("marked", writtenAt = startedAt - 60_000)
        val refused = recording("refused", writtenAt = startedAt - 60_000)
        val uploading = recording("uploading", writtenAt = startedAt - 60_000)
        dao.insert(answer("marked", ownerId = "uid/ada", status = SubmissionStatus.COMPLETED).copy(audioPath = marked.path))
        dao.insert(answer("refused", ownerId = "uid/ada", status = SubmissionStatus.FAILED).copy(audioPath = refused.path))
        dao.insert(answer("uploading", ownerId = "uid/ada", status = SubmissionStatus.UPLOADING).copy(audioPath = uploading.path))

        sweepOrphanRecordings(dao, recordings, startedAt)

        assertFalse(marked.exists())
        assertFalse(refused.exists())
        assertTrue(uploading.exists())
    }

    @Test
    fun `a take written since this process started is kept, as it may be the one the child is giving`() = runBlocking {
        val speaking = recording("speaking", writtenAt = startedAt + 5_000)
        val sameSecond = recording("same-second", writtenAt = startedAt - startedAt % 1_000)

        sweepOrphanRecordings(dao, recordings, startedAt + 400)

        assertTrue(speaking.exists())
        assertTrue(sameSecond.exists())
    }
}
