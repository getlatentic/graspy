package com.latentic.graspy.consent

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/** The notices a parent is shown are the ones docs/API.md promises, word for word. */
class ConsentNoticesTest {
    private val contract = File("../../../docs/API.md").readLines()

    /** The blockquote that follows the line naming the notice. */
    private fun noticeAfter(heading: String): String {
        val start = contract.indexOfFirst { it.startsWith(heading) }
        check(start >= 0) { "docs/API.md has no \"$heading\"" }
        return contract.drop(start + 1).dropWhile { !it.startsWith("> ") }.takeWhile { it.startsWith("> ") }
            .joinToString(" ") { it.removePrefix("> ") }
    }

    @Test
    fun `the service notice is the contract's notice 1 of scope service`() {
        assertEquals(noticeAfter("Notice 1 of scope `service`"), SERVICE_NOTICE)
    }

    @Test
    fun `the recordings notice is the contract's notice 1 of scope recordings, with the days chosen in place of the brackets`() {
        val contractText = noticeAfter("Notice 1 of scope `recordings`")

        RETENTION_DAYS.forEach { days ->
            assertEquals(contractText.replace("[30 / 90 / 365] days", "$days days"), recordingsNotice(days))
        }
    }

    @Test
    fun `the days a parent may choose are the contract's, 30 by default`() {
        assertEquals(listOf(30, 90, 365), RETENTION_DAYS)
        assertEquals(30, DEFAULT_RETENTION_DAYS)
    }
}
