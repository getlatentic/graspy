package com.latentic.graspy.recordings

import java.util.Locale
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Test

class RecordingLabelsTest {
    private val utc = TimeZone.getTimeZone("UTC")

    @Test
    fun `a length is minutes and seconds`() {
        assertEquals("0:04", lengthLabel(4))
        assertEquals("1:05", lengthLabel(65))
        assertEquals("12:00", lengthLabel(720))
    }

    @Test
    fun `a row says when, what for and how long, leaving out what graspy does not know`() {
        val full = kept("r1", 1_759_000_000_000L, lesson = "Two times table", seconds = 4)
        val bare = kept("r2", 1_759_000_000_000L, lesson = null, seconds = null)

        assertEquals("Sep 27, 2025, 7:06 PM · Two times table · 0:04", recordingLabel(full, Locale.US, utc).spaced())
        assertEquals("Sep 27, 2025, 7:06 PM", recordingLabel(bare, Locale.US, utc).spaced())
    }

    /** Newer JDKs put a narrow no-break space before PM. */
    private fun String.spaced() = replace(Regex("[\\u00a0\\u202f]"), " ")
}
