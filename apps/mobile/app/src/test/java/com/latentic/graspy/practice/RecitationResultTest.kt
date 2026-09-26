package com.latentic.graspy.practice

import com.latentic.graspy.collection.EvaluatedSampleDto
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.copyFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RecitationResultTest {
    private val worker = """
        {"sample_id":"gvm_t","state":"complete","transcript":"one times one is one","parsed_answer":null,
         "decision":"try_again","feedback":"You got 10 of 12.","provider":"sahara","latency_ms":1234,
         "exercise":{"kind":"times_table_recitation","table":1,"from":1,"to":12},
         "result":{"correct_multipliers":[1,2,3,6,7,8,9,10],"missing_multipliers":[4],
                   "incorrect_facts":[{"multiplier":5,"expected":5,"heard":6}],
                   "heard_facts":[{"multiplier":1,"heard":1,"latex":"1 \\times 1 = 1"},{"multiplier":3,"latex":"1 \\times 3 = ?"}],
                   "uncertain_multipliers":[11,12]}}
    """.trimIndent()

    @Test
    fun `the evaluation response carries the structured table result`() {
        val dto = apiJson.decodeFromString(EvaluatedSampleDto.serializer(), worker)
        assertEquals(1, dto.exercise?.table)
        assertEquals(listOf(4), dto.result?.missingMultipliers)
        assertEquals(IncorrectFact(5, 5, 6), dto.result?.incorrectFacts?.single())
        assertNull(dto.parsedAnswer)
    }

    @Test
    fun `heard facts render latex operators as glyphs and tolerate a missing product`() {
        val facts = apiJson.decodeFromString(EvaluatedSampleDto.serializer(), worker).result!!.heardFacts
        assertEquals(listOf("1 × 1 = 1", "1 × 3 = ?"), facts.map { it.display })
        assertNull(facts[1].heard)
    }

    @Test
    fun `the stored result round trips through the outbox column`() {
        val result = apiJson.decodeFromString(EvaluatedSampleDto.serializer(), worker).result!!
        assertEquals(result, RecitationResult.fromJson(result.toJson()))
        assertNull(RecitationResult.fromJson(null))
        assertNull(RecitationResult.fromJson("not json"))
    }

    @Test
    fun `the feedback card names the count, missing facts and heard values`() {
        val copy = copyFor(AppLanguage.ENGLISH).lesson
        val exercise = PracticeExercise.TimesTableRecitation.TABLE_1
        val result = apiJson.decodeFromString(EvaluatedSampleDto.serializer(), worker).result!!
        assertEquals("8 of 12 said correctly", recitationSummary(copy, exercise, result))
        assertEquals(listOf(FactLine("1 × 4", null)), missingFactLines(exercise, result))
        assertEquals(listOf(FactLine("1 × 11", null), FactLine("1 × 12", null)), uncertainFactLines(exercise, result))
        val colours = factSegments(exercise, result)
        assertEquals(com.latentic.graspy.ui.Graspy.Warning, colours[10])
        assertEquals(com.latentic.graspy.ui.Graspy.Border, colours[3])
        assertEquals(listOf(FactLine("1 × 5", "heard 6, expected 5")), incorrectFactLines(copy, exercise, result))
    }

    @Test
    fun `elapsed recording time is shown as minutes and seconds`() {
        assertEquals("0:07", formatElapsed(7))
        assertEquals("1:50", formatElapsed(110))
    }
}
