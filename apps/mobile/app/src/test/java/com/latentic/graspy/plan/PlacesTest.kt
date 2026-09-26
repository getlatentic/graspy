package com.latentic.graspy.plan

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/** The countries and languages offered are the web's, code for code. */
class PlacesTest {
    @Test
    fun `every country offers the web's languages in the web's order`() {
        val web = File("../../web/src/lib/country-languages.ts").readText()
        val entries = Regex("""^\s*"?([A-Z]{2,})"?:\s*\[([^\]]*)]""", RegexOption.MULTILINE).findAll(web).associate { match ->
            match.groupValues[1] to match.groupValues[2].split(',').map { it.trim().trim('"') }.filter(String::isNotEmpty)
        }
        assertEquals(entries, COUNTRY_LANGUAGES)
    }

    @Test
    fun `the server is sent English names, as the web sends them`() {
        assertEquals("Nigeria", countryName("NG"))
        assertEquals("Palestine", countryName("PS"))
        assertEquals("Yoruba", languageName("yo"))
        assertEquals("Nigerian Pidgin", languageName("pcm"))
        assertEquals("NG", countryCodeOf("Nigeria"))
        assertEquals("yo", languageCodeOf("Yoruba"))
    }
}
