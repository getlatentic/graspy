package com.latentic.graspy.home

import com.latentic.graspy.sync.RefreshState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogueScreenStateTest {
    private val stored = listOf(
        CatalogueLesson("mathematics.table-2", "mathematics", "multiplication", "The two times table", LessonStanding.MASTERED, false),
        CatalogueLesson("everyday.days.week", "everyday", "days", "The days of the week", LessonStanding.STARTED, true),
    )

    @Test
    fun `a learner who has synced sees yesterday's lessons at once, with a quiet refresh`() {
        val state = catalogueState(stored, RefreshState.RUNNING, online = true) as CatalogueState.Ready

        assertEquals("The days of the week", state.current?.title)
        assertEquals(listOf("mathematics", "everyday"), state.topics.map { it.subject })
        assertTrue(state.refreshing)
    }

    @Test
    fun `stored lessons still show when the refresh fails and the phone is offline`() {
        val state = catalogueState(stored, RefreshState.FAILED, online = false) as CatalogueState.Ready

        assertEquals(2, state.topics.sumOf { it.lessons.size })
        assertFalse(state.refreshing)
    }

    @Test
    fun `the refresh mark clears once the newer catalogue has landed`() {
        val state = catalogueState(stored, RefreshState.SUCCEEDED, online = true) as CatalogueState.Ready

        assertFalse(state.refreshing)
    }

    @Test
    fun `only a learner who has never synced waits`() {
        assertEquals(CatalogueState.Loading, catalogueState(emptyList(), RefreshState.RUNNING, online = true))
    }

    @Test
    fun `only a learner who has never synced and cannot reach the worker is told so`() {
        assertEquals(CatalogueState.Failed, catalogueState(emptyList(), RefreshState.RUNNING, online = false))
        assertEquals(CatalogueState.Failed, catalogueState(emptyList(), RefreshState.FAILED, online = true))
    }

    @Test
    fun `a class the worker has no lessons for is an empty class, not a failure`() {
        val state = catalogueState(emptyList(), RefreshState.SUCCEEDED, online = true) as CatalogueState.Ready

        assertEquals(null, state.current)
        assertTrue(state.topics.isEmpty())
    }
}
