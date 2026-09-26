package com.latentic.graspy.ask

import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.mcpJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull

/** What the tutor asks the app to do, each checked field by field as the web checks it (lib/a2a/reply-data.ts). */
sealed interface TutorAction {
    data class OpenTopic(val subjectSlug: String, val topicIndex: Int, val topic: String) : TutorAction

    data class OpenSubject(val subjectSlug: String, val subject: String) : TutorAction

    data class AddTopic(val subjectSlug: String, val subject: String, val topic: String) : TutorAction

    data class ChangeSubjects(val add: List<String>, val remove: List<String>) : TutorAction

    data object RebuildPlan : TutorAction

    data class ProposePath(val goal: String) : TutorAction
}

data class TutorReply(
    val text: String,
    val contextId: String?,
    val followUps: List<String> = emptyList(),
    val actions: List<TutorAction> = emptyList(),
    val cards: List<ViewCard> = emptyList(),
)

/** The tutor's turn as it streams: what it says, what it is doing, and where the thread is. */
interface TurnListener {
    fun onDelta(text: String) = Unit

    /** What streamed is withdrawn: the tutor is writing the answer again. */
    fun onRestart() = Unit

    fun onActivity(tool: String) = Unit
}

/**
 * Reads one turn's stream event by event, as the web's client does (lib/a2a/client.ts). Everything here
 * arrives from the network, so each field is checked before it is trusted, and a malformed extra costs
 * the extra, not the answer.
 */
class TurnReader(contextId: String?, private val listener: TurnListener) {
    private var thread = contextId
    private var answer = ""
    private var data = JsonObject(emptyMap())
    private var streamed = false
    var finished = false
        private set
    var heard = false
        private set

    fun read(result: JsonObject) {
        (result["task"] as? JsonObject)?.let { thread = it.text("contextId") ?: thread }
        (result["artifactUpdate"] as? JsonObject)?.let(::artifact)
        (result["statusUpdate"] as? JsonObject)?.let(::status)
        (result["message"] as? JsonObject)?.let(::said)
    }

    fun reply(): TutorReply = TutorReply(
        text = answer.trim(),
        contextId = thread,
        followUps = (data["followUps"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content },
        actions = (data["actions"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::actionOf) },
        cards = (data["cards"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::cardOf) },
    )

    private fun artifact(update: JsonObject) {
        val piece = textOf(update["artifact"] as? JsonObject)
        // A2A replaces an artifact sent without append, withdrawing what showed.
        if ((update["append"] as? JsonPrimitive)?.contentOrNull != "true" && streamed) listener.onRestart()
        if (piece.isEmpty()) return
        streamed = true
        heard = true
        listener.onDelta(piece)
    }

    private fun status(update: JsonObject) {
        val status = update["status"] as? JsonObject ?: return
        if (status.text("state") == COMPLETED) finished = true
        val message = status["message"] as? JsonObject
        activityOf(message)?.let(listener::onActivity)
        said(message)
    }

    private fun said(message: JsonObject?) {
        if (message?.text("role") != AGENT) return
        val text = textOf(message)
        if (text.isBlank()) return
        answer = text
        data = dataOf(message) ?: JsonObject(emptyMap())
    }

    private fun textOf(message: JsonObject?): String =
        parts(message).mapNotNull { it.text("text") }.joinToString("")

    private fun dataOf(message: JsonObject?): JsonObject? = parts(message).firstNotNullOfOrNull { it["data"] as? JsonObject }

    private fun activityOf(message: JsonObject?): String? =
        message?.takeIf { it.text("role") == AGENT }?.let(::dataOf)?.text("activity")

    private fun parts(message: JsonObject?): List<JsonObject> =
        (message?.get("parts") as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }

    private fun actionOf(value: JsonObject): TutorAction? = when (value.text("type")) {
        "open_topic" -> {
            val slug = value.text("subjectSlug")
            val index = (value["topicIndex"] as? JsonPrimitive)?.takeUnless(JsonPrimitive::isString)?.doubleOrNull?.takeIf { it >= 0 && it % 1.0 == 0.0 }?.toInt()
            val topic = value.text("topic")
            if (slug != null && index != null && topic != null) TutorAction.OpenTopic(slug, index, topic) else null
        }
        "open_subject" -> {
            val slug = value.text("subjectSlug")
            val subject = value.text("subject")
            if (slug != null && subject != null) TutorAction.OpenSubject(slug, subject) else null
        }
        "add_topic" -> {
            val slug = value.text("subjectSlug")
            val subject = value.text("subject")
            val topic = value.text("topic")?.takeIf { it.isNotBlank() }
            if (slug != null && subject != null && topic != null) TutorAction.AddTopic(slug, subject, topic) else null
        }
        "change_subjects" -> {
            val add = names(value["add"])
            val remove = names(value["remove"])
            if (add != null && remove != null && add.size + remove.size > 0) TutorAction.ChangeSubjects(add, remove) else null
        }
        "rebuild_plan" -> TutorAction.RebuildPlan
        "propose_path" -> value.text("goal")?.takeIf { it.isNotBlank() }?.let(TutorAction::ProposePath)
        else -> null
    }

    private fun names(value: JsonElement?): List<String>? {
        val list = value as? JsonArray ?: return null
        return list.map { (it as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content ?: return null }
    }

    private fun cardOf(value: JsonObject): ViewCard? {
        val uri = value.text("resourceUri") ?: return null
        val result = value["toolResult"] as? JsonObject ?: return null
        if (!uri.startsWith("ui://") || result["content"] !is JsonArray || value["toolInput"] !is JsonObject) return null
        return runCatching { mcpJson.decodeFromJsonElement<ViewCard>(value) }.getOrNull()
    }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.content

    private companion object {
        const val AGENT = "ROLE_AGENT"
        const val COMPLETED = "TASK_STATE_COMPLETED"
    }
}
