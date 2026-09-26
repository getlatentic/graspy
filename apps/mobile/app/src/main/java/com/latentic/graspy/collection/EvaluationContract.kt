package com.latentic.graspy.collection

fun EvaluatedSampleDto.isCompleteFor(promptId: String?): Boolean =
    state == "complete" && !transcript.isNullOrBlank() &&
        decision in setOf("correct", "try_again", "not_understood") &&
        !feedback.isNullOrBlank() && !provider.isNullOrBlank() && latencyMs != null &&
        (promptId?.startsWith("mul_table_") != true || result != null)
