package com.latentic.graspy.mcp

import android.content.Context
import com.latentic.graspy.account.context
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Whether the learner learns by voice alone, as the server answers learner_route, kept for when it cannot be asked. */
@RunWith(RobolectricTestRunner::class)
class LearnerRoutesTest {
    private val preferences = context().getSharedPreferences("routes-test", Context.MODE_PRIVATE)
    private val nursery = ClassAsk("NG", "nursery-2", "Nursery 2 (Early childhood), Nigeria, age 4")
    private val asked = mutableListOf<Pair<String, JsonObject>>()

    private fun answering(voiceOnly: Boolean): suspend (String, JsonObject) -> JsonObject = { name, arguments ->
        asked += name to arguments
        buildJsonObject { putJsonObject("structuredContent") { put("voiceOnly", voiceOnly) } }
    }

    private val unreachable: suspend (String, JsonObject) -> JsonObject = { _, _ -> throw IOException("offline") }

    @Test
    fun `the server is asked through MCP for the class the plan names, and its answer is kept`() = runBlocking {
        val routes = LearnerRoutes(answering(true), preferences, "ada")

        assertEquals(true, routes.ask(nursery))

        assertEquals("learner_route", asked.single().first)
        assertEquals(nursery.arguments(), asked.single().second)
        assertEquals(true, routes.answers.value[nursery.key])
        assertEquals(true, LearnerRoutes(unreachable, preferences, "ada").answers.value[nursery.key])
    }

    @Test
    fun `the server's answer stands over one kept before`() = runBlocking {
        LearnerRoutes(answering(true), preferences, "ada").ask(nursery)

        assertEquals(false, LearnerRoutes(answering(false), preferences, "ada").ask(nursery))
    }

    @Test
    fun `without a connection the answer kept stands, and before any there is none`() = runBlocking {
        assertNull(LearnerRoutes(unreachable, preferences, "ada").ask(nursery))
        LearnerRoutes(answering(true), preferences, "ada").ask(nursery)

        assertEquals(true, LearnerRoutes(unreachable, preferences, "ada").ask(nursery))
    }

    @Test
    fun `a refusal is no answer`() = runBlocking {
        val refusing = LearnerRoutes({ _, _ -> buildJsonObject { put("isError", true) } }, preferences, "ada")

        assertNull(refusing.ask(nursery))
    }

    @Test
    fun `answers are kept per learner and per class`() = runBlocking {
        LearnerRoutes(answering(true), preferences, "ada").ask(nursery)

        assertNull(LearnerRoutes(unreachable, preferences, "bayo").answers.value[nursery.key])
        assertNull(LearnerRoutes(unreachable, preferences, "ada").answers.value[nursery.copy(level = "primary-1").key])
    }

    @Test
    fun `a plan with no class is asked about by the level the server reads alone`() {
        assertEquals(buildJsonObject { put("gradeLevel", "JSS 1") }, ClassAsk(null, "", "JSS 1").arguments())
    }
}
