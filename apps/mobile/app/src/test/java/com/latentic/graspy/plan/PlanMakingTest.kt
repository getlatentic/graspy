package com.latentic.graspy.plan

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** A plan made from the curriculum stream, as the web's onboarding and rebuild make one. */
class PlanMakingTest {
    private val details = LearnerDetails(
        country = "NG", language = "yo", system = "NG", level = "jss-1",
        levelNames = Names("JSS 1", mapOf("yo" to "JSS 1")), course = "", gradeLevel = "JSS 1 (Junior Secondary School), Nigeria, age 12",
    )
    private var asked: CurriculumRequest? = null

    private fun streamOf(vararg results: String, error: String? = null) = CurriculumSource { request, onResult ->
        asked = request
        results.forEach { onResult(planJson.parseToJsonElement(it).jsonObject) }
        error
    }

    @Test
    fun `the plan is written for the learner, with the subjects and topics the stream sent`() = runBlocking {
        val maker = PlanMaker(streamOf("""{"type":"result","subjects":["Mathematics",{"name":"Basic Science","slug":"Basic Science"}]}""", """{"type":"result","topics":{"mathematics":["Fractions"],"Basic Science":["Cells"]}}""")) { 1_000L }
        val progress = mutableListOf<LearnerPlan>()

        val plan = maker.make(details, listOf("Mathematics"), progress::add)

        assertEquals(CurriculumRequest("Nigeria", "Yoruba", details.gradeLevel, listOf("Mathematics")), asked)
        assertEquals("plan-1000", plan.planId)
        assertEquals(listOf(PlanSubject("Mathematics", "mathematics"), PlanSubject("Basic Science", "basic-science")), plan.subjects)
        assertEquals(mapOf("mathematics" to listOf("Fractions"), "basic-science" to listOf("Cells")), plan.topics)
        assertEquals("mathematics", plan.assessment?.nextSubject)
        assertEquals(listOf("NG", "yo", "jss-1"), listOf(plan.countryCode, plan.languageCode, plan.level))
        assertEquals(listOf("Nigeria", "Yoruba"), listOf(plan.country, plan.language))
        assertTrue(progress.isNotEmpty())
    }

    @Test
    fun `a class that learns by voice alone gets a plan with no subjects, written for it, without the stream`() {
        val nursery = details.copy(level = "nursery-1", levelNames = Names("Nursery 1"), gradeLevel = "Nursery 1 (Early childhood), Nigeria, age 3")
        val maker = PlanMaker(streamOf(error = "The stream is not asked")) { 2_000L }

        val plan = maker.voiceOnly(nursery)

        assertEquals(null, asked)
        assertEquals("plan-2000", plan.planId)
        assertEquals(emptyList<PlanSubject>(), plan.subjects)
        assertEquals(emptyMap<String, List<String>>(), plan.topics)
        assertEquals(nursery, plan.details())
    }

    @Test
    fun `the stream's own error stops the plan`() {
        val maker = PlanMaker(streamOf(error = "Curriculum generation failed"))
        assertThrows(PlanNotMade::class.java) { runBlocking { maker.make(details, emptyList()) } }
    }

    @Test
    fun `a plan's details and every field it does not read travel back to the server`() {
        val raw = planJson.parseToJsonElement("""{"planId":"p","updatedAt":5,"subjects":[],"futureField":{"a":1},"countryCode":"SK"}""").jsonObject
        val plan = LearnerPlan.of(raw).withDetails(details)
        val sent = plan.toJson()

        assertEquals(raw["futureField"], sent["futureField"])
        assertEquals("NG", (sent["countryCode"] as kotlinx.serialization.json.JsonPrimitive).content)
        assertEquals(details, LearnerPlan.of(sent as JsonObject).details())
    }

    @Test
    fun `the class reads as its name in the learner's language, else the level the server reads`() {
        val plan = LearnerPlan(planId = "p", gradeLevel = "Grade 8 (Basic school), Slovakia, age 13", languageCode = "sk")
        val learn = com.latentic.graspy.localization.learnCopyFor(com.latentic.graspy.localization.InterfaceLanguage.ENGLISH)

        assertEquals("Grade 8", plan.levelLabel(learn))
        assertEquals("Grade 8", plan.copy(gradeLevel = "Grade 8 (Basic school (Základná škola)), Slovakia, age 13").levelLabel(learn))
        assertEquals("middle school learners", plan.copy(gradeLevel = "middle school learners").levelLabel(learn))
        assertEquals("8. ročník", plan.copy(levelNames = Names("Grade 8", mapOf("sk" to "8. ročník"))).levelLabel(learn))
        assertEquals("Undergraduate", plan.copy(level = "undergraduate").levelLabel(learn))
    }
}
