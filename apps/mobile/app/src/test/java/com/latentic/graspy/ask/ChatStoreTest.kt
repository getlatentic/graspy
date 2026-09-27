package com.latentic.graspy.ask

import androidx.room.Room
import com.latentic.graspy.collection.outbox.GraspyDatabase
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** Conversations kept on the phone per topic, per learner, as the web keeps them per browser. */
@RunWith(RobolectricTestRunner::class)
class ChatStoreTest {
    private val database = Room.inMemoryDatabaseBuilder(RuntimeEnvironment.getApplication(), GraspyDatabase::class.java).allowMainThreadQueries().build()
    private var now = 1L
    private val ada = ChatStore(database.chatDao(), "uid/ada") { now++ }
    private val bayo = ChatStore(database.chatDao(), "uid/bayo") { now++ }
    private val fractions = ThreadScope.Topic("plan-1", "maths", "Fractions")

    @After
    fun close() = database.close()

    @Test
    fun `a topic keeps one conversation, found again by its topic`() = runBlocking {
        val thread = ada.ensureThread(fractions)

        assertEquals(thread.id, ada.ensureThread(fractions).id)
        assertNotEquals(thread.id, ada.ensureThread(ThreadScope.Topic("plan-1", "maths", "Ratios")).id)
        assertNotEquals(thread.id, ada.ensureThread(ThreadScope.Subject("plan-1", "maths")).id)
        assertEquals(3, ada.threads.first().size)
    }

    @Test
    fun `the conversation keeps its messages and the tutor's memory, latest first`() = runBlocking {
        val thread = ada.ensureThread(fractions)
        ada.ensureThread(ThreadScope.General("plan-1"))
        ada.add(thread.id, MessageKind.LEARNER, "What is a half?")
        ada.add(thread.id, MessageKind.TUTOR, "One of two equal parts.", MessageMetadata(followUps = listOf("And a quarter?")))
        ada.recordTurn(thread, "ctx-9", "What is a half?")

        val kept = ada.messages(thread.id).first()
        assertEquals(listOf(MessageKind.LEARNER, MessageKind.TUTOR), kept.map { it.kind })
        assertEquals(listOf("And a quarter?"), kept.last().metadata.followUps)
        val found = ada.threadFor(fractions)!!
        assertEquals("ctx-9" to "What is a half?", found.agentContextId to found.preview)
        assertEquals(found.id, ada.threads.first().first().id)
    }

    @Test
    fun `a failure is shown, never kept`() = runBlocking {
        val thread = ada.ensureThread(fractions)
        ada.add(thread.id, MessageKind.FAILED, "That didn't get through.")

        assertTrue(ada.messages(thread.id).first().isEmpty())
    }

    @Test
    fun `what is said here is kept to send, and told`() = runBlocking {
        val told = async(start = CoroutineStart.UNDISPATCHED) { ada.kept.first() }
        val thread = ada.ensureThread(fractions)
        ada.add(thread.id, MessageKind.LEARNER, "What is a half?")
        ada.add(thread.id, MessageKind.FAILED, "That didn't get through.")

        told.await()
        assertEquals(listOf(thread.id), database.chatDao().unsentThreads("uid/ada").map { it.id })
        assertEquals(listOf("What is a half?"), database.chatDao().unsentMessages("uid/ada").map { it.content })
    }

    @Test
    fun `each learner has their own conversations`() = runBlocking {
        ada.ensureThread(fractions)

        assertTrue(bayo.threads.first().isEmpty())
        assertEquals(null, bayo.threadFor(fractions))
    }
}
