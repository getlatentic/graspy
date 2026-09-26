package com.latentic.graspy.home

import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.sync.RefreshState
import com.latentic.graspy.ui.Graspy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class LessonCatalogueTest {
    private val copy = copyFor(InterfaceLanguage.ENGLISH)
    private val yoruba = copyFor(InterfaceLanguage.YORUBA)

    private val payload = """
        {"day": "2026-09-06", "lessons": [
          {"plan_id": "mathematics.multiplication.table-2", "subject": "mathematics", "topic": "multiplication",
           "title": {"en": "The two times table", "yo": "Table two", "pcm": "Table two"},
           "standing": "mastered", "days_correct": 2, "current": false},
          {"plan_id": "everyday.days.week", "subject": "everyday", "topic": "days",
           "title": {"en": "The days of the week", "yo": "Àwọn ọjọ́ ọ̀sẹ̀", "pcm": "The days of the week"},
           "standing": "started", "days_correct": 0, "current": true},
          {"plan_id": "mathematics.multiplication.table-3", "subject": "mathematics", "topic": "multiplication",
           "title": {"en": "The three times table", "yo": "Table three", "pcm": "Table three"},
           "standing": "untouched", "days_correct": 0, "current": false}
        ]}
    """.trimIndent()

    private fun catalogue(): CatalogueDto = apiJson.decodeFromString(CatalogueDto.serializer(), payload)

    private fun lesson(
        planId: String,
        subject: String,
        standing: LessonStanding = LessonStanding.UNTOUCHED,
        current: Boolean = false,
    ) = CatalogueLesson(planId, subject, subject, planId, standing, current)

    private fun themed(planId: String, topic: String) =
        CatalogueLesson(planId, "mathematics", topic, planId, LessonStanding.UNTOUCHED, false)

    @Test
    fun `twelve times tables are one theme, not twelve headings`() {
        val groups = ((1..12).map { themed("table-$it", "multiplication") } +
            listOf(themed("counting-to-ten", "number"), themed("clock", "time"))).byTopic()

        assertEquals(listOf("multiplication", "number", "time"), groups.map { it.topic })
        assertEquals(12, groups[0].lessons.size)
    }

    @Test
    fun `a theme keeps the order its lessons were taught in`() {
        val groups = listOf(themed("table-1", "multiplication"), themed("clock", "time"),
            themed("table-2", "multiplication")).byTopic()

        assertEquals(listOf("table-1", "table-2"), groups[0].lessons.map { it.planId })
    }

    @Test
    fun `the worker's catalogue reply is read field for field`() {
        val catalogue = catalogue()

        assertEquals("2026-09-06", catalogue.day)
        assertEquals(3, catalogue.lessons.size)
        val first = catalogue.lessons.first()
        assertEquals("mathematics.multiplication.table-2", first.planId)
        assertEquals("multiplication", first.topic)
        assertEquals(2, first.daysCorrect)
        assertEquals("mastered", first.standing)
        assertEquals(true, catalogue.lessons[1].current)
    }

    @Test
    fun `a lesson is titled in the language the learner reads`() {
        val lessons = catalogue().lessons

        assertEquals("The days of the week", lessons[1].toLesson(AppLanguage.ENGLISH).title)
        assertEquals("Àwọn ọjọ́ ọ̀sẹ̀", lessons[1].toLesson(AppLanguage.YORUBA).title)
        assertEquals(LessonStanding.MASTERED, lessons[0].toLesson(AppLanguage.ENGLISH).standing)
    }

    @Test
    fun `a standing the app does not know is a broken plan, not a default`() {
        val broken = catalogue().lessons.first().copy(standing = "nearly")

        assertThrows(IllegalArgumentException::class.java) { broken.toLesson(AppLanguage.ENGLISH) }
        assertThrows(IllegalArgumentException::class.java) {
            catalogue().lessons.first().copy(title = mapOf("yo" to "Table two")).toLesson(AppLanguage.ENGLISH)
        }
    }

    @Test
    fun `subjects keep the order they are first taught, and so do their lessons`() {
        val groups = listOf(
            lesson("m1", "mathematics"),
            lesson("e1", "everyday"),
            lesson("m2", "mathematics"),
            lesson("e2", "everyday"),
        ).byTopic()

        assertEquals(listOf("mathematics", "everyday"), groups.map { it.subject })
        assertEquals(listOf("m1", "m2"), groups[0].lessons.map { it.planId })
        assertEquals(listOf("e1", "e2"), groups[1].lessons.map { it.planId })
    }

    @Test
    fun `the current lesson is the one the teacher marked, and may be none`() {
        val lessons = listOf(lesson("m1", "mathematics"), lesson("e1", "everyday", current = true))

        assertEquals("e1", lessons.currentLesson()?.planId)
        assertNull(lessons.map { it.copy(current = false) }.currentLesson())
    }

    @Test
    fun `one reply becomes the next lesson and the class grouped by subject`() {
        val lessons = catalogue().lessons.map { it.toLesson(AppLanguage.ENGLISH) }

        val state = catalogueState(lessons, RefreshState.SUCCEEDED, online = true) as CatalogueState.Ready

        assertEquals("The days of the week", state.current?.title)
        assertEquals(listOf("mathematics", "everyday"), state.topics.map { it.subject })
        assertEquals(
            listOf("The two times table", "The three times table"),
            state.topics[0].lessons.map { it.title },
        )
    }

    @Test
    fun `standing shows as green for correct and grey for not done`() {
        assertEquals("Known", standingBadge(copy.home, LessonStanding.MASTERED).label)
        assertEquals(Graspy.SuccessSurface, standingBadge(copy.home, LessonStanding.MASTERED).pill)
        assertEquals(Graspy.WarningSurface, standingBadge(copy.home, LessonStanding.LEARNT).pill)
        assertEquals(Graspy.Surface, standingBadge(copy.home, LessonStanding.STARTED).pill)
        assertEquals(Graspy.Background, standingBadge(copy.home, LessonStanding.UNTOUCHED).pill)
        assertEquals(Graspy.TextCaption, standingBadge(copy.home, LessonStanding.UNTOUCHED).text)
    }

    @Test
    fun `every standing speaks the learner's language`() {
        assertEquals(
            listOf("Ti mọ̀", "Ti kọ́", "Ti bẹ̀rẹ̀", "Kò tíì"),
            LessonStanding.entries.map { standingBadge(yoruba.home, it).label },
        )
        assertEquals(
            listOf("You sabi am", "Don learn am", "Don start", "Never start"),
            LessonStanding.entries.map { standingBadge(copyFor(InterfaceLanguage.PIDGIN).home, it).label },
        )
    }
}
