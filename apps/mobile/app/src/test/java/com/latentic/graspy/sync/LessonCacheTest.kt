package com.latentic.graspy.sync

import com.latentic.graspy.collection.LessonMoveDto
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.home.CatalogueDto
import com.latentic.graspy.home.LessonStanding
import com.latentic.graspy.localization.AppLanguage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LessonCacheTest {
    private val catalogue: CatalogueDto = apiJson.decodeFromString(
        CatalogueDto.serializer(),
        """
        {"day": "2026-09-06", "lessons": [
          {"plan_id": "mathematics.multiplication.table-2", "subject": "mathematics", "topic": "multiplication",
           "title": {"en": "The two times table", "yo": "Table meji", "pcm": "Table two"},
           "standing": "mastered", "days_correct": 2, "current": false},
          {"plan_id": "everyday.days.week", "subject": "everyday", "topic": "days",
           "title": {"en": "The days of the week", "yo": "Ojo ose", "pcm": "Days of the week"},
           "standing": "started", "days_correct": 0, "current": true}
        ]}
        """.trimIndent(),
    )

    private val move: LessonMoveDto = apiJson.decodeFromString(
        LessonMoveDto.serializer(),
        """
        {"revision": 17, "day": "2026-09-06", "move": {"kind": "event",
         "plan_id": "everyday.days.week", "event_id": "present", "event": "present_content",
         "subject": "everyday", "title": {"en": "Days", "yo": "Ojo", "pcm": "Days"},
         "say": "plan.everyday.days.week.present",
         "say_text": {"en": "Monday comes first.", "yo": "Monday lo kokan.", "pcm": "Monday dey first."},
         "reason": "start"}}
        """.trimIndent(),
    )

    @Test
    fun `a catalogue reply becomes stored rows that keep the teaching order`() {
        val stored = catalogue.toStoredLessons("owner-1", "primary_3", fetchedAtEpochMillis = 900L)

        assertEquals(listOf(0, 1), stored.map { it.position })
        assertEquals(listOf("mathematics.multiplication.table-2", "everyday.days.week"), stored.map { it.planId })
        assertTrue(stored.all { it.ownerId == "owner-1" && it.learnerClass == "primary_3" })
        assertTrue(stored.all { it.day == "2026-09-06" && it.fetchedAtEpochMillis == 900L })
        assertEquals(listOf(false, true), stored.map { it.current })
        assertEquals(2, stored[0].daysCorrect)
    }

    @Test
    fun `a stored lesson reads back in every language, so changing language needs no network`() {
        val stored = catalogue.toStoredLessons("owner-1", "primary_3", fetchedAtEpochMillis = 900L)

        assertEquals("The days of the week", stored[1].toLesson(AppLanguage.ENGLISH).title)
        assertEquals("Ojo ose", stored[1].toLesson(AppLanguage.YORUBA).title)
        assertEquals("Days of the week", stored[1].toLesson(AppLanguage.PIDGIN).title)
        assertEquals(LessonStanding.MASTERED, stored[0].toLesson(AppLanguage.ENGLISH).standing)
        assertEquals(true, stored[1].toLesson(AppLanguage.ENGLISH).current)
    }

    @Test
    fun `the stored move is the step the worker issued, with the day and revision it issued it for`() {
        val stored = move.toStoredMove("owner-1", "primary_3", fetchedAtEpochMillis = 900L)

        assertEquals(17L, stored.revision)
        assertEquals("2026-09-06", stored.day)
        assertEquals(900L, stored.fetchedAtEpochMillis)
        assertEquals("everyday.days.week" to "present", stored.move().planId to stored.move().eventId)
        assertEquals("Monday lo kokan.", stored.move().text(AppLanguage.YORUBA))
    }
}
