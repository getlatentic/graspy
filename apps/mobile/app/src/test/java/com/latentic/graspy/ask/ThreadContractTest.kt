package com.latentic.graspy.ask

import com.latentic.graspy.mcp.ViewCard
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The phone shares conversations as graspy's contract has them (apps/server/scripts/export_thread_contract.py
 * writes it): what a device sends, and what graspy's store returns for it, as the web reads and sends them too.
 */
class ThreadContractTest {
    private val contract = chatJson.parseToJsonElement(
        requireNotNull(javaClass.classLoader?.getResource("thread-contract.json")).readText(),
    ).jsonObject
    private val sent = contract.getValue("sent").jsonObject.getValue("threads").jsonArray.map { it.jsonObject }
    private val changes = chatJson.decodeFromJsonElement(ThreadChanges.serializer(), contract.getValue("changes"))

    private fun JsonObject.messages() = getValue("messages").jsonArray.map { it.jsonObject }

    /** A thread as the phone keeps it: its scope as it writes one, each message's metadata as it came. */
    private fun keptHere(thread: JsonObject): Pair<ChatThreadEntity, List<ChatMessageEntity>> {
        val scope = scopeJson.decodeFromJsonElement(ThreadScope.serializer(), thread.getValue("scope"))
        val entity = ChatThreadEntity(
            OWNER, thread.getValue("id").jsonPrimitive.content, scope.key, scopeJson.encodeToString(ThreadScope.serializer(), scope),
            thread["agentContextId"]?.jsonPrimitive?.content, thread["preview"]?.jsonPrimitive?.content,
            thread.getValue("createdAt").jsonPrimitive.long, thread.getValue("updatedAt").jsonPrimitive.long,
        )
        val messages = thread.messages().map { message ->
            val timestamp = message.getValue("timestamp").jsonPrimitive.long
            val editedAt = message.getValue("editedAt").jsonPrimitive.long
            ChatMessageEntity(
                OWNER, message.getValue("id").jsonPrimitive.content, entity.id, message.getValue("type").jsonPrimitive.content,
                message.getValue("content").jsonPrimitive.content, timestamp, message["metadata"]?.toString(),
                editedAt = editedAt.takeIf { it != timestamp },
            )
        }
        return entity to messages
    }

    @Test
    fun `each thread is sent as graspy takes it`() {
        for (thread in sent) {
            val (entity, messages) = keptHere(thread)

            assertEquals(thread, chatJson.encodeToJsonElement(WireThread.serializer(), entity.sent(messages)))
        }
    }

    @Test
    fun `the phone writes its own messages as the contract has them`() {
        val messages = sent.flatMap { it.messages() }.associateBy { it.getValue("id").jsonPrimitive.content }
        fun metadataOf(id: String) = messages.getValue(id).getValue("metadata").jsonObject
        val card = chatJson.decodeFromJsonElement(ViewCard.serializer(), metadataOf(ANSWER).getValue("card"))
        val answered = metadataOf(QUESTION).getValue("appCalls").jsonArray.map { it.jsonObject }
        val written = mapOf(
            QUESTION to MessageMetadata(appCalls = answered),
            ANSWER to MessageMetadata(followUps = listOf("What is a half as a decimal?"), card = card),
            STOPPED to MessageMetadata(stopped = true),
            LESSON_NOTE to MessageMetadata(link = ChatLink("Open lesson", LinkTarget.Lesson("mathematics", 3))),
            SUBJECTS_NOTE to MessageMetadata(link = ChatLink("See subjects", LinkTarget.Subjects)),
            SUBJECT_NOTE to MessageMetadata(link = ChatLink("Open subject", LinkTarget.Subject("mathematics"))),
        )

        for ((id, metadata) in written) {
            // What only the web keeps, its views' calls, the phone keeps as it came and never writes.
            val expected = JsonObject(metadataOf(id) - "viewCalls")
            assertEquals(id, expected, chatJson.encodeToJsonElement(MessageMetadata.serializer(), metadata))
        }
    }

    @Test
    fun `each thread graspy returns is read with every message`() {
        val read = changes.threads.mapNotNull(::readThread)

        assertEquals(sent.map { it.getValue("id").jsonPrimitive.content }.sorted(), read.map { it.id }.sorted())
        assertEquals(listOf("general", "subject", "topic"), read.map { it.scope.key.substringBefore('\u0000') }.sorted())
        assertEquals(sent.sumOf { it.messages().size }, read.sumOf { it.messages.size })
    }

    @Test
    fun `what the phone shows of each message is read from what graspy returns`() {
        val read = changes.threads.mapNotNull(::readThread).flatMap { it.messages }.associateBy { it.id }
        fun shown(id: String) = readMetadata(read.getValue(id).metadata.toString())

        assertEquals(LinkTarget.Lesson("mathematics", 3), shown(LESSON_NOTE).link?.to)
        assertEquals(LinkTarget.Subjects, shown(SUBJECTS_NOTE).link?.to)
        assertEquals(LinkTarget.Subject("mathematics"), shown(SUBJECT_NOTE).link?.to)
        val answer = shown(ANSWER)
        assertEquals("ui://graspy/practice", answer.card?.resourceUri)
        assertEquals(listOf("What is a half as a decimal?"), answer.followUps)
        assertEquals(true, shown(STOPPED).stopped)
        assertEquals(1, shown(QUESTION).appCalls.size)
    }

    @Test
    fun `a part the phone cannot read costs that part alone`() {
        val metadata = """{"followUps":["Next?"],"link":{"label":"Somewhere","to":{"type":"elsewhere"}},"stopped":"yes"}"""

        assertEquals(MessageMetadata(followUps = listOf("Next?")), readMetadata(metadata))
        assertEquals(MessageMetadata(), readMetadata("not json"))
    }

    private companion object {
        const val OWNER = "uid-1/aaaaaaaaaaaa"
        const val QUESTION = "msg-1790000000000-a1b2c3d4e"
        const val ANSWER = "msg-1790000030000-f5e6d7c8b"
        const val STOPPED = "msg-1790000040000-9a8b7c6d5"
        const val LESSON_NOTE = "msg-1790000060000-0f1e2d3c4"
        const val SUBJECTS_NOTE = "msg-1790000080000-6f7e8d9c0"
        const val SUBJECT_NOTE = "msg-1790000080001-5e4d3c2b1"
    }
}
