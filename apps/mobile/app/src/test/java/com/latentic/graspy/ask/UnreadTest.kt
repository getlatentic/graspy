package com.latentic.graspy.ask

import org.junit.Assert.assertEquals
import org.junit.Test

class UnreadTest {
    @Test
    fun `a reply to a thread the learner is not looking at is marked`() {
        val unread = Unread().lookingAt("a").answered("b")
        assertEquals(setOf("b"), unread.threads)
    }

    @Test
    fun `a reply to the thread on screen is not marked`() {
        assertEquals(emptySet<String>(), Unread().lookingAt("a").answered("a").threads)
    }

    @Test
    fun `a reply that comes while no conversation is on screen is marked`() {
        assertEquals(setOf("a"), Unread().lookingAt("a").lookingAt(null).answered("a").threads)
    }

    @Test
    fun `looking at a marked thread clears it and leaves the others`() {
        val unread = Unread().answered("a").answered("b").lookingAt("a")
        assertEquals(setOf("b"), unread.threads)
        assertEquals("a", unread.viewing)
    }

    @Test
    fun `leaving the conversations keeps what is marked`() {
        assertEquals(setOf("b"), Unread().answered("b").lookingAt(null).threads)
    }
}
