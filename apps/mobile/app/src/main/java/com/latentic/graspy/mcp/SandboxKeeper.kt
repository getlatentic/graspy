package com.latentic.graspy.mcp

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * Whether the service worker of [sandbox], a path on the API, holds every file of its build, so a page of that
 * build opens with no connection. [needed] names the sandboxes kept pages still open in; any other is dropped.
 */
fun interface SandboxKeeper {
    suspend fun keep(sandbox: String, needed: Set<String>): Boolean
}

/** One keep's conversation with the sandbox proxy, as the web's: asked once the proxy is ready, answered once. */
internal class SandboxKeep(private val needed: Set<String>) {
    sealed interface Step {
        /** To send the proxy. */
        data class Ask(val message: JsonObject) : Step

        data class Done(val kept: Boolean) : Step
    }

    fun heard(message: JsonElement): Step? {
        val body = message as? JsonObject ?: return null
        return when (body.string("method")) {
            ViewSession.PROXY_READY -> Step.Ask(keep())
            KEPT -> Step.Done((body.path("params")?.get("kept") as? JsonPrimitive)?.takeUnless { it.isString }?.booleanOrNull == true)
            else -> null
        }
    }

    private fun keep() = buildJsonObject {
        put("jsonrpc", "2.0")
        put("method", KEEP)
        putJsonObject("params") { putJsonArray("sandboxes") { needed.forEach { add(JsonPrimitive(it)) } } }
    }

    private companion object {
        const val KEEP = "graspy/sandbox-keep"
        const val KEPT = "graspy/sandbox-kept"
    }
}
