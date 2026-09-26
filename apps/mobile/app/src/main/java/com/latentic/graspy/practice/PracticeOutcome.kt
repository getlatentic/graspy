package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.SubmissionEntity
import com.latentic.graspy.collection.outbox.SubmissionStatus

enum class PracticeDecision { CORRECT, TRY_AGAIN, NOT_UNDERSTOOD }

data class PracticeOutcome(
    val transcript: String,
    val parsedAnswer: Int?,
    val decision: PracticeDecision,
    val feedback: String,
    val provider: String,
    val latencyMs: Int,
    val recitation: RecitationResult? = null,
    val sequence: SequenceResult? = null,
)

fun SubmissionEntity.practiceOutcome(): PracticeOutcome? {
    if (status != SubmissionStatus.COMPLETED.name) return null
    val recordedTranscript = transcript ?: return null
    val recordedFeedback = feedback ?: return null
    val recordedProvider = provider ?: return null
    val recordedLatency = latencyMs ?: return null
    val recitation = RecitationResult.fromJson(resultJson)
    if (promptId?.startsWith("mul_table_") == true && recitation == null) return null
    val recordedDecision = when (decision) {
        "correct" -> PracticeDecision.CORRECT
        "try_again" -> PracticeDecision.TRY_AGAIN
        "not_understood" -> PracticeDecision.NOT_UNDERSTOOD
        else -> return null
    }
    return PracticeOutcome(
        transcript = recordedTranscript,
        parsedAnswer = parsedAnswer,
        decision = recordedDecision,
        feedback = recordedFeedback,
        provider = recordedProvider,
        latencyMs = recordedLatency,
        recitation = recitation,
    )
}
