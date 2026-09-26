package com.latentic.graspy.ask

import com.latentic.graspy.mcp.mcpJson
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** A tutor turn read from the stream the server sends (A2A 1.0 JSON-RPC, as captured). */
class TurnReaderTest {
    private val heard = mutableListOf<String>()
    private val listener = object : TurnListener {
        override fun onDelta(text: String) {
            heard += "delta:$text"
        }

        override fun onRestart() {
            heard += "restart"
        }

        override fun onActivity(tool: String) {
            heard += "activity:$tool"
        }
    }
    private val reader = TurnReader(null, listener)

    @Test
    fun `the answer streams, and the finished message replaces it with its extras`() {
        listOf(
            """{"task":{"id":"t","contextId":"ctx-1","status":{"state":"TASK_STATE_SUBMITTED"}}}""",
            """{"statusUpdate":{"status":{"state":"TASK_STATE_WORKING","message":{"role":"ROLE_AGENT","parts":[{"data":{"activity":"give_practice"}}]}}}}""",
            """{"artifactUpdate":{"artifact":{"artifactId":"answer","parts":[{"text":"Here"}]}}}""",
            """{"artifactUpdate":{"artifact":{"artifactId":"answer","parts":[{"text":" it is"}]},"append":true}}""",
            """{"artifactUpdate":{"artifact":{"artifactId":"answer","parts":[{"text":"Again"}]}}}""",
            """{"statusUpdate":{"status":{"state":"TASK_STATE_COMPLETED","message":{"role":"ROLE_AGENT","parts":[{"text":"Here it is."},{"data":$EXTRAS}]}}}}""",
        ).forEach { reader.read(mcpJson.parseToJsonElement(it) as JsonObject) }

        assertEquals(listOf("activity:give_practice", "delta:Here", "delta: it is", "restart", "delta:Again"), heard)
        assertTrue(reader.finished)
        val reply = reader.reply()
        assertEquals("Here it is.", reply.text)
        assertEquals("ctx-1", reply.contextId)
        assertEquals(listOf("Can you check my answer?"), reply.followUps)
        assertEquals(listOf(TutorAction.OpenTopic("maths", 2, "Ratios")), reply.actions)
        assertEquals("ui://graspy/practice", reply.cards.single().resourceUri)
    }

    @Test
    fun `a malformed extra costs the extra, not the answer`() {
        val broken = """{"followUps":[3,"Why?"],"actions":[{"type":"open_topic","subjectSlug":"maths"},{"type":"rebuild_plan"}],"cards":[{"resourceUri":"https://x","toolName":"t","toolInput":{},"toolResult":{"content":[]}}]}"""
        reader.read(mcpJson.parseToJsonElement("""{"message":{"role":"ROLE_AGENT","parts":[{"text":"Still here."},{"data":$broken}]}}""") as JsonObject)

        val reply = reader.reply()
        assertEquals("Still here.", reply.text)
        assertEquals(listOf("Why?"), reply.followUps)
        assertEquals(listOf(TutorAction.RebuildPlan), reply.actions)
        assertTrue(reply.cards.isEmpty())
    }

    @Test
    fun `the learner's own message is never taken for the tutor's`() {
        reader.read(mcpJson.parseToJsonElement("""{"message":{"role":"ROLE_USER","parts":[{"text":"Hi"}]}}""") as JsonObject)

        assertEquals("", reader.reply().text)
    }

    private companion object {
        const val EXTRAS = """{"followUps":["Can you check my answer?"],"actions":[{"type":"open_topic","subjectSlug":"maths","topicIndex":2,"topic":"Ratios"}],"cards":[{"resourceUri":"ui://graspy/practice","toolName":"give_practice","toolInput":{"instruction":"Add."},"toolResult":{"content":[{"type":"text","text":"1."}],"structuredContent":{"questions":[]}}}]}"""
    }
}
