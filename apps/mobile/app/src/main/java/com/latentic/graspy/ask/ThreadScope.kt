package com.latentic.graspy.ask

import com.latentic.graspy.plan.CurrentTopic
import com.latentic.graspy.plan.LearnerPlan
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** What a conversation is about, fixed when it starts, as the web keeps it (apps/web/src/lib/chat-db.ts). */
@Serializable
sealed interface ThreadScope {
    val key: String

    @Serializable
    @SerialName("topic")
    data class Topic(val planId: String, val subjectSlug: String, val topic: String) : ThreadScope {
        override val key get() = "topic\u0000$planId\u0000$subjectSlug\u0000$topic"
    }

    @Serializable
    @SerialName("subject")
    data class Subject(val planId: String, val subjectSlug: String) : ThreadScope {
        override val key get() = "subject\u0000$planId\u0000$subjectSlug"
    }

    @Serializable
    @SerialName("general")
    data class General(val planId: String) : ThreadScope {
        override val key get() = "general\u0000$planId"
    }
}

/** A conversation as the learner finds it: by topic index, which the plan's topics resolve to a topic. */
sealed interface ChatTarget {
    data class Topic(val subjectSlug: String, val topicIndex: Int) : ChatTarget

    data class Subject(val subjectSlug: String) : ChatTarget

    data object General : ChatTarget
}

internal val scopeJson = Json {
    classDiscriminator = "kind"
    ignoreUnknownKeys = true
}

fun scopeOf(target: ChatTarget, plan: LearnerPlan): ThreadScope? = when (target) {
    ChatTarget.General -> ThreadScope.General(plan.planId)
    is ChatTarget.Subject -> plan.subject(target.subjectSlug)?.let { ThreadScope.Subject(plan.planId, it.slug) }
    is ChatTarget.Topic -> plan.subject(target.subjectSlug)?.let {
        plan.topicsOf(it.slug).getOrNull(target.topicIndex)?.let { topic -> ThreadScope.Topic(plan.planId, it.slug, topic) }
    }
}

/** Null when the plan no longer holds what the conversation was about. */
fun targetOf(scope: ThreadScope, plan: LearnerPlan): ChatTarget? = when (scope) {
    is ThreadScope.General -> ChatTarget.General.takeIf { scope.planId == plan.planId }
    is ThreadScope.Subject -> ChatTarget.Subject(scope.subjectSlug).takeIf { scope.planId == plan.planId && plan.subject(scope.subjectSlug) != null }
    is ThreadScope.Topic -> plan.topicsOf(scope.subjectSlug).indexOf(scope.topic)
        .takeIf { scope.planId == plan.planId && it >= 0 }
        ?.let { ChatTarget.Topic(scope.subjectSlug, it) }
}

/** The conversation Ask opens: the latest the plan still holds, else the topic Home continues, else anything. */
fun latestChat(threads: List<ChatThread>, plan: LearnerPlan, current: CurrentTopic?): ChatTarget =
    threads.firstNotNullOfOrNull { targetOf(it.scope, plan) }
        ?: current?.let { ChatTarget.Topic(it.subject.slug, it.index) }
        ?: ChatTarget.General

/** What changing the conversation offers, as the web's chat directory does. */
data class ChatDirectory(
    val topic: Pair<CurrentTopic, ChatTarget>?,
    val recent: List<Pair<ChatThread, ChatTarget>>,
    /** Null while the general conversation is the one open. */
    val anything: ChatThread?,
    val offerAnything: Boolean,
    val offerTopics: Boolean,
)

private const val RECENT_SHOWN = 5

fun chatDirectory(threads: List<ChatThread>, plan: LearnerPlan, current: CurrentTopic?, open: ThreadScope?): ChatDirectory {
    val openKey = open?.key
    val topic = current?.let { ChatTarget.Topic(it.subject.slug, it.index) }
        ?.takeIf { target -> scopeOf(target, plan)?.let { it.key != openKey } == true }
        ?.let { current to it }
    val recent = threads.asSequence()
        .filter { it.scope !is ThreadScope.General && it.scope.key != openKey }
        .mapNotNull { thread -> targetOf(thread.scope, plan)?.let { thread to it } }
        .take(RECENT_SHOWN)
        .toList()
    return ChatDirectory(
        topic = topic,
        recent = recent,
        anything = threads.firstOrNull { it.scope is ThreadScope.General && targetOf(it.scope, plan) != null },
        offerAnything = open !is ThreadScope.General,
        offerTopics = plan.subjects.isNotEmpty(),
    )
}
