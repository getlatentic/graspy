package com.latentic.graspy.localization

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * The parent's screens say what the web's do (`consent` and `voiceRecordings` in apps/web/src/locales) in every
 * language. It runs once the web has those screens, and is skipped before.
 */
class ConsentWebWordsTest {
    private val locales = File("../../web/src/locales")

    private fun web(language: InterfaceLanguage): JsonObject =
        Json.parseToJsonElement(File(locales, "${language.tag}.json").readText()).jsonObject

    private fun JsonObject.text(vararg path: String): String? =
        path.fold(this as Any?) { node, key -> (node as? JsonObject)?.get(key) }.let { (it as? JsonPrimitive)?.content }

    @Test
    fun `the consent words are the web's, in every language`() {
        InterfaceLanguage.entries.forEach { language ->
            val words = web(language)
            assumeTrue(words.text("consent", "agree") != null)
            val copy = accountCopyFor(language).consent
            mapOf(
                "serviceTitle" to copy.title,
                "who" to copy.who,
                "agree" to copy.agree,
                "decline" to copy.decline,
                "needed" to copy.needed,
                "signIn" to copy.signIn,
                "otherAccount" to copy.otherAccount,
            ).forEach { (key, text) -> assertEquals("${language.tag} consent.$key", words.text("consent", key), text) }
        }
    }

    @Test
    fun `the recordings words are the web's, in every language`() {
        InterfaceLanguage.entries.forEach { language ->
            val words = web(language)
            assumeTrue(words.text("voiceRecordings", "title") != null)
            val copy = accountCopyFor(language).recordings
            mapOf(
                "title" to copy.title,
                "off" to copy.off,
                "keep" to copy.keep,
                "keptFor" to copy.keptFor,
                "keepFor" to copy.keepFor,
                "days" to copy.days,
                "empty" to copy.empty,
                "play" to copy.play,
                "stop" to copy.stop,
                "delete" to copy.delete,
                "deleteAll" to copy.deleteAll,
                "deleteAllConfirm" to copy.deleteAllConfirm,
                "more" to copy.more,
                "stopTitle" to copy.stopTitle,
                "stopDelete" to copy.stopDelete,
                "stopKeep" to copy.stopKeep,
                "gone" to copy.gone,
                "playFailed" to copy.playFailed,
            ).forEach { (key, text) -> assertEquals("${language.tag} voiceRecordings.$key", words.text("voiceRecordings", key), text) }
            assertEquals("${language.tag} learners.recordings", words.text("learners", "recordings"), copy.link)
        }
    }
}
