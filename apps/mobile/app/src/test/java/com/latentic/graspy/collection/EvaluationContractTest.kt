package com.latentic.graspy.collection

import org.junit.Assert.*
import org.junit.Test

class EvaluationContractTest {
    private val result = EvaluatedSampleDto("sample", "complete", "six", 6, "correct", "Correct", "intron_sync", 20)

    @Test fun `unrecognized decisions and incomplete recitations cannot be persisted as completed`() {
        assertTrue(result.isCompleteFor("mul_fact_2x3_say"))
        assertFalse(result.copy(decision = "success").isCompleteFor("mul_fact_2x3_say"))
        assertFalse(result.copy(transcript = " ").isCompleteFor("mul_fact_2x3_say"))
        assertFalse(result.isCompleteFor("mul_table_2_recite_1_12"))
        assertFalse(result.copy(state = "processing").isCompleteFor("mul_fact_2x3_say"))
    }
}
