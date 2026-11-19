package com.latentic.graspy.subjects

import com.latentic.graspy.ui.AgeBand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A subject's picture is found by the same patterns as the web's, and grows with the learner's band. */
class SubjectArtTest {
    @Test
    fun `the first matching pattern wins, as on the web`() {
        assertEquals(SubjectArt.AGRICULTURE, SubjectArt.of("Agricultural Technology"))
        assertEquals(SubjectArt.ICT, SubjectArt.of("Computer Science"))
        assertEquals(SubjectArt.CIVIC, SubjectArt.of("Political Science"))
        assertEquals(SubjectArt.MATH, SubjectArt.of("Mathematics"))
        assertEquals(SubjectArt.ENGLISH, SubjectArt.of("English Language"))
        assertEquals(SubjectArt.SCIENCE, SubjectArt.of("Basic Science"))
        assertEquals(SubjectArt.PE, SubjectArt.of("Physical and Health Education"))
    }

    @Test
    fun `science and technology is science, and a language subject is not English`() {
        assertEquals(SubjectArt.SCIENCE, SubjectArt.of("Basic Science and Technology"))
        assertEquals(SubjectArt.ICT, SubjectArt.of("Information Technology"))
        assertNull(SubjectArt.of("Yoruba Language"))
        assertEquals(SubjectArt.ENGLISH, SubjectArt.of("English Language"))
    }

    @Test
    fun `home economics is not business, and an unknown subject has no picture`() {
        assertNull(SubjectArt.of("Home Economics"))
        assertNull(SubjectArt.of("Yoruba Studies"))
    }

    @Test
    fun `each band has its own picture`() {
        val pictures = AgeBand.entries.map { SubjectArt.MATH.drawable(it) }
        assertEquals(3, pictures.toSet().size)
        assertNotEquals(SubjectArt.MATH.drawable(AgeBand.Child), SubjectArt.SCIENCE.drawable(AgeBand.Child))
    }

    @Test
    fun `all thirty-six pictures are different`() {
        val pictures = SubjectArt.entries.flatMap { art -> AgeBand.entries.map(art::drawable) }
        assertEquals(36, pictures.toSet().size)
    }
}
