package com.latentic.graspy.localization

import java.lang.reflect.Modifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Every language the app's words come in has every string, with the same placeholders as English. */
class CopyCompletenessTest {
    private val books: Map<String, (InterfaceLanguage) -> Any> = mapOf(
        "app" to ::copyFor,
        "account" to ::accountCopyFor,
        "learn" to ::learnCopyFor,
    )

    @Test
    fun `every language has every string, none blank, with English's placeholders`() {
        books.forEach { (book, copy) ->
            val english = strings(copy(InterfaceLanguage.ENGLISH), book)
            InterfaceLanguage.entries.forEach { language ->
                val translated = strings(copy(language), book)
                assertEquals("$language $book has other strings than English", english.keys, translated.keys)
                translated.forEach { (path, text) ->
                    assertTrue("$language $path is blank", text.isNotBlank())
                    assertEquals("$language $path keeps other placeholders", placeholders(english.getValue(path)), placeholders(text))
                }
            }
        }
    }

    @Test
    fun `Arabic is written in Arabic, with the digits the web writes`() {
        books.forEach { (book, copy) ->
            // A string of placeholders alone, such as "{subject} · {grade}", has no words to write in Arabic.
            val arabic = strings(copy(InterfaceLanguage.ARABIC), book)
                .filterValues { it.replace(PLACEHOLDER, "").any(Char::isLetter) }
            arabic.forEach { (path, text) ->
                assertTrue("$path is not in Arabic: $text", ARABIC_LETTER.containsMatchIn(text))
                assertTrue("$path writes Arabic-Indic digits: $text", !ARABIC_INDIC_DIGIT.containsMatchIn(text))
            }
        }
    }

    /** Each string by its path through the copy, so a missing or extra one names itself. */
    private fun strings(value: Any?, path: String): Map<String, String> = when (value) {
        is String -> mapOf(path to value)
        is Map<*, *> -> value.entries.fold(emptyMap()) { all, (key, item) -> all + strings(item, "$path[$key]") }
        is List<*> -> value.foldIndexed(emptyMap()) { index, all, item -> all + strings(item, "$path[$index]") }
        null, is Boolean, is Number -> emptyMap()
        else -> value.javaClass.declaredFields
            .filterNot { Modifier.isStatic(it.modifiers) }
            .onEach { it.isAccessible = true }
            .fold(emptyMap()) { all, field -> all + strings(field.get(value), "$path.${field.name}") }
    }

    private fun placeholders(text: String): List<String> = PLACEHOLDER.findAll(text).map { it.value }.sorted().toList()

    private companion object {
        val PLACEHOLDER = Regex("""%(\d+\$)?[sd]|\{[a-z]+}""")
        val ARABIC_LETTER = Regex("[\\u0621-\\u064A]")
        val ARABIC_INDIC_DIGIT = Regex("[\\u0660-\\u0669\\u06F0-\\u06F9]")
    }
}
