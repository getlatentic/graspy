package com.latentic.graspy.plan

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** Slugs as the web and the server make them, held to the corpus they share (tests/fixtures/slug-corpus.json). */
class SlugsTest {
    @Test
    fun `every slug in the shared corpus comes out the same`() {
        val corpus = Json.parseToJsonElement(File("../../../tests/fixtures/slug-corpus.json").readText()).jsonArray
        corpus.map { it.jsonObject }.forEach { case ->
            val input = case.getValue("input").jsonPrimitive.content
            assertEquals(input, case.getValue("expected").jsonPrimitive.content, normalizeSlug(input))
        }
    }

    @Test
    fun `a Hausa hooked consonant keeps its subject apart`() {
        assertNotEquals(normalizeSlug("Bai"), normalizeSlug("Baƙi"))
    }

    @Test
    fun `a taken slug is suffixed, and what is returned is reserved`() {
        val existing = mutableSetOf<String>()
        assertEquals(listOf("mathematics", "mathematics-2", "mathematics-3"), List(3) { createSlug("Mathematics", existing) })
    }

    @Test
    fun `blank names drop and a subject's own free slug is kept`() {
        assertEquals(
            listOf(PlanSubject("Biology", "bio"), PlanSubject("Chemistry", "chemistry"), PlanSubject("Chemistry 2", "chemistry-2")),
            normalizeSubjectList(listOf(PlanSubject("Biology", "bio"), PlanSubject("  ", ""), PlanSubject("Chemistry", ""), PlanSubject("Chemistry 2", "chemistry"))),
        )
    }
}
