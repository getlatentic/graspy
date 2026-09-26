package com.latentic.graspy.ui

import java.io.File
import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The generated token files match content/design/tokens.json, the design system the web shares: each
 * carries the hash of the tokens and the generator it was made from, and of its own content.
 */
class GraspyTokensTest {
    private val design = File("../../../content/design")
    private val generated = listOf(
        File("src/main/java/com/latentic/graspy/ui/GraspyTokens.kt"),
        File("src/main/res/values/graspy_tokens.xml"),
        File("src/main/assets/app-host/tokens.css"),
    )

    @Test
    fun `the token files were generated from the current tokens`() {
        val source = sha256(File(design, "tokens.json").readBytes() + File(design, "build.mjs").readBytes())
        generated.forEach { assertEquals(stale(it), source, stamp(it).source) }
    }

    @Test
    fun `the token files have not been edited by hand`() {
        generated.forEach { file ->
            val stamp = stamp(file)
            assertEquals(stale(file), stamp.content, sha256(stamp.body.toByteArray()))
        }
    }

    private class Stamp(val source: String, val content: String, val body: String)

    private fun stamp(file: File): Stamp {
        val text = file.readText()
        val match = STAMP.find(text) ?: error(stale(file))
        return Stamp(match.groupValues[1], match.groupValues[2], text.substring(match.range.last + 1))
    }

    private fun stale(file: File) = "${file.name} is stale: run `node content/design/build.mjs` from the repository root."

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private companion object {
        val STAMP = Regex("""graspy-tokens source=(\w+) content=(\w+)[^\n]*\n""")
    }
}
