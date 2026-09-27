package com.latentic.graspy.ask

import android.app.Application
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.room.withTransaction
import com.latentic.graspy.account.Outbox
import com.latentic.graspy.account.PreferenceFiles
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.retrofit
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** How far the phone has read a learner's conversations from graspy: the seq it last read up to. */
class ThreadCursor(private val preferences: SharedPreferences, ownerId: String) {
    private val key = "since:$ownerId"

    fun since(): Long = preferences.getLong(key, 0)

    fun keep(since: Long) = preferences.edit { putLong(key, since) }
}

/** A thread with what of it graspy has yet to be sent. */
data class Unsent(val thread: ChatThreadEntity, val messages: List<ChatMessageEntity>)

/** What one request carries, within graspy's limits (app/threads/wire.py): a thread may be split over several. */
class Batch(val parts: List<Unsent>) {
    val sent: SentThreads get() = SentThreads(parts.map { it.thread.sent(it.messages) })
}

/**
 * A learner's conversations follow them to their other devices, as the web's thread sync does (lib/threads/
 * thread-sync.ts): each sync sends what this phone has not sent, then takes in what changed since the seq it last
 * read, beside the phone's own copy of each conversation, found by what it is about. Nothing is written once the
 * phone no longer learns as the learner ([stillLearning]), so a wipe leaves nothing of them.
 */
class ThreadSync(
    private val dao: ChatDao,
    private val ownerId: String,
    private val api: ThreadsApi,
    private val cursor: ThreadCursor,
    private val stillLearning: () -> Boolean,
    /** Runs the learner check and the writes as one: a wipe waits for writes already checked, then takes them too. */
    private val inOneTransaction: suspend (suspend () -> Unit) -> Unit = { it() },
) {
    /** Sends and reads; false while some of what was said here is still on the phone only. */
    suspend fun sync(): Boolean = running.withLock {
        send()
        readChanges()
        unsent().isEmpty()
    }

    /** Sends what is unsent; false while some of it is still on the phone only. */
    suspend fun sentEverything(): Boolean = running.withLock {
        send()
        unsent().isEmpty()
    }

    private suspend fun unsent(): List<Unsent> {
        val messages = dao.unsentMessages(ownerId).groupBy { it.threadId }
        return dao.unsentThreads(ownerId).map { Unsent(it, messages[it.id].orEmpty()) }
    }

    private suspend fun send() {
        repeat(ROUNDS) {
            if (!stillLearning()) return
            val unsent = unsent().ifEmpty { return }
            for (batch in batches(unsent)) {
                val before = cursor.since()
                val seq = api.keep(batch.sent).seq
                if (!stillLearning()) return
                inOneTransaction { batch.parts.forEach { markSent(it) } }
                // Nothing was written between: what this phone has read runs on to its own send.
                if (seq == before + 1) cursor.keep(seq)
            }
        }
    }

    private suspend fun markSent(sent: Unsent) {
        val thread = sent.thread
        dao.threadSent(ownerId, thread.id, thread.updatedAt, thread.agentContextId, thread.preview)
        sent.messages.forEach { dao.messageSent(ownerId, it.id, it.lastEdited) }
    }

    private suspend fun readChanges() {
        val known = cursor.since()
        val first = api.changes(known)
        // A seq behind what this phone read: everything is read again.
        val since = if (first.upTo < known) 0L else known
        var page = if (since == known) first else api.changes(since)
        while (true) {
            if (!takeIn(page.threads.mapNotNull(::readThread))) return
            val next = page.next ?: break
            page = api.changes(since, page.upTo, next)
        }
        if (stillLearning()) cursor.keep(page.upTo)
    }

    /** One page, in one transaction; false once the phone no longer learns as the learner. */
    private suspend fun takeIn(threads: List<ReadThread>): Boolean {
        var taken = false
        inOneTransaction {
            if (stillLearning()) {
                threads.forEach { takeInThread(it) }
                taken = true
            }
        }
        return taken
    }

    private suspend fun takeInThread(read: ReadThread) {
        val own = dao.threadFor(ownerId, read.scope.key)
        val thread = joined(own, read)
        if (thread != own) dao.saveThread(thread)
        for (message in read.messages) {
            taken(dao.message(ownerId, message.id), message, thread.id)?.let { dao.saveMessage(it) }
        }
    }

    /** The later question is the preview, and the context graspy holds is every device's. */
    private fun joined(own: ChatThreadEntity?, read: ReadThread): ChatThreadEntity = own?.copy(
        agentContextId = read.agentContextId ?: own.agentContextId,
        preview = if (read.updatedAt > own.updatedAt) read.preview ?: own.preview else own.preview,
        createdAt = minOf(own.createdAt, read.createdAt),
        updatedAt = maxOf(own.updatedAt, read.updatedAt),
    ) ?: ChatThreadEntity(
        ownerId, read.id, read.scope.key, scopeJson.encodeToString(ThreadScope.serializer(), read.scope),
        read.agentContextId, read.preview, read.createdAt, read.updatedAt, unsent = false,
    )

    /** A message kept here changes only for a later edit; an equal one is what graspy has. */
    private fun taken(own: ChatMessageEntity?, read: WireMessage, threadId: String): ChatMessageEntity? = when {
        own == null -> ChatMessageEntity(
            ownerId, read.id, threadId, read.type, read.content, read.timestamp, read.metadata?.toString(),
            editedAt = read.editedAt.takeIf { it != read.timestamp }, unsent = false,
        )
        read.editedAt > own.lastEdited -> own.copy(
            content = read.content, metadataJson = read.metadata?.toString(), editedAt = read.editedAt, unsent = false,
        )
        read.editedAt == own.lastEdited && own.unsent -> own.copy(unsent = false)
        else -> null
    }

    companion object {
        // Said while a send runs goes with the next round; a few rounds catch a turn's.
        private const val ROUNDS = 3
        private const val MAX_THREADS = 50
        private const val MAX_MESSAGES = 200
        /** Counted in UTF-8 bytes, as D1 counts the batch it binds as one string. */
        private const val MAX_BYTES = 1_000_000

        /** One sync at a time on the phone, whichever screen or leave started it. */
        private val running = Mutex()

        /** Within each request's limits, a long conversation split over several. */
        fun batches(unsent: List<Unsent>): List<Batch> {
            val all = mutableListOf<Batch>()
            var parts = mutableListOf<Unsent>()
            var messages = 0
            var bytes = 0
            fun close() {
                if (parts.isNotEmpty()) all += Batch(parts)
                parts = mutableListOf()
                messages = 0
                bytes = 0
            }
            fun place(thread: ChatThreadEntity): Int {
                if (parts.size == MAX_THREADS) close()
                parts += Unsent(thread, emptyList())
                bytes += sizeOf(thread.sent(emptyList()))
                return parts.lastIndex
            }
            for ((thread, kept) in unsent) {
                var part: Int? = null
                for (message in kept) {
                    val size = sizeOf(message.sent())
                    if (messages == MAX_MESSAGES || (parts.isNotEmpty() && bytes + size > MAX_BYTES)) {
                        close()
                        part = null
                    }
                    val at = part ?: place(thread)
                    part = at
                    parts[at] = parts[at].copy(messages = parts[at].messages + message)
                    messages += 1
                    bytes += size
                }
                // A thread with nothing new but itself, as when its context arrived.
                if (part == null) place(thread)
            }
            close()
            return all
        }

        private fun sizeOf(message: WireMessage) = chatJson.encodeToString(WireMessage.serializer(), message).encodeToByteArray().size

        private fun sizeOf(thread: WireThread) = chatJson.encodeToString(WireThread.serializer(), thread).encodeToByteArray().size
    }
}

/** The learner's conversations, synced under their own session only. */
fun threadSyncFor(application: Application, ownerId: String): ThreadSync {
    val database = AppGraph.database(application)
    return ThreadSync(
        dao = database.chatDao(),
        ownerId = ownerId,
        api = retrofit(AppGraph.callsFor(application, ownerId)).create(ThreadsApi::class.java),
        cursor = ThreadCursor(application.getSharedPreferences(PreferenceFiles.THREADS, 0), ownerId),
        stillLearning = { AppGraph.account(application).learnsAs(ownerId) },
        inOneTransaction = { block -> database.withTransaction { block() } },
    )
}

/** A learner's conversations, sent before the phone leaves them: whether none is left on the phone only. */
fun keptThreads(application: Application): Outbox = Outbox { learnerKey -> threadSyncFor(application, learnerKey).sentEverything() }
