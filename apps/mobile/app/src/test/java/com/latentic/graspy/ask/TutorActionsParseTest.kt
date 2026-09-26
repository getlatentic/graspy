package com.latentic.graspy.ask

import com.latentic.graspy.mcp.mcpJson
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** Each action the tutor sends is checked field by field, as the web checks it; a malformed one is dropped. */
class TutorActionsParseTest {
    private fun actions(json: String): List<TutorAction> {
        val reader = TurnReader(null, object : TurnListener {})
        reader.read(mcpJson.parseToJsonElement("""{"message":{"role":"ROLE_AGENT","parts":[{"text":"Done."},{"data":{"actions":$json}}]}}""") as JsonObject)
        return reader.reply().actions
    }

    @Test
    fun `every kind of action the web knows is read`() {
        assertEquals(
            listOf(
                TutorAction.OpenTopic("maths", 2, "Ratios"),
                TutorAction.OpenSubject("maths", "Mathematics"),
                TutorAction.AddTopic("maths", "Mathematics", "Probability"),
                TutorAction.ChangeSubjects(listOf("Art"), listOf("Music")),
                TutorAction.RebuildPlan,
                TutorAction.ProposePath("Calculus"),
            ),
            actions(
                """[{"type":"open_topic","subjectSlug":"maths","topicIndex":2.0,"topic":"Ratios"},
                {"type":"open_subject","subjectSlug":"maths","subject":"Mathematics"},
                {"type":"add_topic","subjectSlug":"maths","subject":"Mathematics","topic":"Probability"},
                {"type":"change_subjects","add":["Art"],"remove":["Music"]},
                {"type":"rebuild_plan"},
                {"type":"propose_path","goal":"Calculus"}]""",
            ),
        )
    }

    @Test
    fun `an action missing what it needs is dropped`() {
        assertEquals(
            emptyList<TutorAction>(),
            actions(
                """[{"type":"open_topic","subjectSlug":"maths","topicIndex":1.5,"topic":"Ratios"},
                {"type":"add_topic","subjectSlug":"maths","subject":"Mathematics","topic":"  "},
                {"type":"change_subjects","add":[],"remove":[]},
                {"type":"change_subjects","add":[3],"remove":[]},
                {"type":"propose_path","goal":""},
                {"type":"delete_everything"}]""",
            ),
        )
    }
}
