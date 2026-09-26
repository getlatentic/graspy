package com.latentic.graspy.ask

import com.latentic.graspy.mcp.ViewCard
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

data class ChatThread(
    val id: String,
    val scope: ThreadScope,
    val agentContextId: String?,
    val preview: String?,
    val createdAt: Long,
    val updatedAt: Long,
)

/** Where a note from the app leads: a lesson, a subject, or the learner's subjects. */
@Serializable
sealed interface LinkTarget {
    @Serializable
    @SerialName("lesson")
    data class Lesson(val subjectSlug: String, val topicIndex: Int) : LinkTarget

    @Serializable
    @SerialName("subject")
    data class Subject(val subjectSlug: String) : LinkTarget

    @Serializable
    @SerialName("subjects")
    data object Subjects : LinkTarget
}

@Serializable
data class ChatLink(val label: String, val to: LinkTarget)

@Serializable
data class MessageMetadata(
    val followUps: List<String> = emptyList(),
    val card: ViewCard? = null,
    /** Carried by a learner's message: what their views did since the last. */
    val appCalls: List<JsonObject> = emptyList(),
    val link: ChatLink? = null,
    val stopped: Boolean = false,
)

enum class MessageKind(val wire: String) {
    LEARNER("user"),
    TUTOR("system"),
    /** What the app did, in its own words: the model saying it changed something is no proof. */
    DONE("complete"),
    /** Never kept, or failures would stack up in the learner's history. */
    FAILED("error"),
    ;

    companion object {
        fun of(wire: String) = entries.firstOrNull { it.wire == wire } ?: TUTOR
    }
}

data class ChatMessage(
    val id: String,
    val threadId: String,
    val kind: MessageKind,
    val content: String,
    val timestamp: Long,
    val metadata: MessageMetadata = MessageMetadata(),
)

/** Questions whose turns failed, so the tutor never read them. */
fun unansweredIn(messages: List<ChatMessage>): List<String> {
    val answered = messages.indexOfLast { it.kind == MessageKind.TUTOR || it.kind == MessageKind.DONE }
    return messages.drop(answered + 1).filter { it.kind == MessageKind.LEARNER }.map { it.content }
}
