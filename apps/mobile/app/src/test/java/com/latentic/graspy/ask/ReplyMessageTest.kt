package com.latentic.graspy.ask

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Only the app's own reply page reaches the app, and a reply's link opens only to the web. */
class ReplyMessageTest {
    private val page = "https://graspy.getlatentic.com"

    @Test
    fun `the reply page says it is ready, how tall it is, and which link was tapped`() {
        assertEquals(ReplyMessage.Ready, replyMessageOf(page, true, """{"kind":"ready"}"""))
        assertEquals(ReplyMessage.Height(312), replyMessageOf(page, true, """{"kind":"height","px":312}"""))
        assertEquals(ReplyMessage.Open("https://example.org/a"), replyMessageOf(page, true, """{"kind":"open","href":"https://example.org/a"}"""))
    }

    @Test
    fun `anything else is refused`() {
        assertNull(replyMessageOf("https://graspy-api.getlatentic.com", true, """{"kind":"ready"}"""))
        assertNull(replyMessageOf(page, false, """{"kind":"ready"}"""))
        assertNull(replyMessageOf(page, true, """{"kind":"open","href":"javascript:alert(1)"}"""))
        assertNull(replyMessageOf(page, true, """{"kind":"open","href":"intent://settings"}"""))
        assertNull(replyMessageOf(page, true, """{"kind":"height","px":-4}"""))
        assertNull(replyMessageOf(page, true, "not json"))
    }
}
