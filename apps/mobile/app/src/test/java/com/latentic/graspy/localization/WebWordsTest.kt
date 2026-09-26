package com.latentic.graspy.localization

import java.io.File
import java.lang.reflect.Modifier
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** The app says what the web says: each of its shared strings is the web locale's string at the same key. */
class WebWordsTest {
    private val locales = File("../../web/src/locales")

    @Test
    fun `every shared string is the web's own, in every language`() {
        InterfaceLanguage.entries.forEach { language ->
            val web = Json.parseToJsonElement(File(locales, "${language.tag}.json").readText()).jsonObject
            strings(learnCopyFor(language), emptyList()).forEach { (path, text) ->
                assertEquals("${language.tag} ${path.joinToString(".")}", webString(web, path), text)
            }
        }
    }

    private fun webString(web: JsonObject, path: List<String>): String? =
        path.fold(web as Any?) { node, key -> (node as? JsonObject)?.get(key) }
            .let { (it as? JsonPrimitive)?.content }

    private fun strings(value: Any?, path: List<String>): List<Pair<List<String>, String>> = when (value) {
        is String -> listOf(path to value)
        is Map<*, *> -> value.flatMap { (key, item) -> strings(item, path + key.toString()) }
        else -> value!!.javaClass.declaredFields
            .filterNot { Modifier.isStatic(it.modifiers) }
            .onEach { it.isAccessible = true }
            .flatMap { strings(it.get(value), path + it.name) }
    }
}
