package com.latentic.graspy.mcp

import com.latentic.graspy.account.SessionRefusal
import java.io.IOException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * The server answered, and did not do what was asked. [aboutTheCall]: its final word on this very call, which
 * would be refused again; otherwise the answer was temporary or about the session, and a later try may pass.
 */
class McpRefusal(message: String, val aboutTheCall: Boolean = true) : IOException(message)

/** No answer came, as the web's failed fetch: neither the server nor the session in front of it refused. */
fun Throwable.isUnreachable(): Boolean = this is IOException && this !is McpRefusal && this !is SessionRefusal

/** The server refused this very call, as the web's outbox reads it (lib/mcp/refusal.ts). Nothing else lets kept work go. */
fun Throwable.refusesTheCall(): Boolean = this is McpRefusal && aboutTheCall

/**
 * A 4xx, except a timeout, a rate limit or one about the session, such as 413 for a body over the server's limit.
 * graspy's /mcp gives every refusal a JSON-RPC error; a 4xx without one came from something in the way: a proxy,
 * a CDN, a route mid-deploy.
 */
internal fun refusedOverHttp(status: Int, body: String): Boolean =
    status in 400..499 && status !in PASSING_STATUSES && errorCodeOf(body) != null

/** JSON-RPC's invalid request, method not found and invalid params: sent again, the call would be refused again. */
internal fun refusedOverRpc(error: JsonElement): Boolean = codeOf(error) in ABOUT_THE_CALL

private fun errorCodeOf(body: String): Int? = try {
    (mcpJson.parseToJsonElement(body) as? JsonObject)?.get("error")?.let(::codeOf)
} catch (unreadable: SerializationException) {
    null
}

private fun codeOf(error: JsonElement): Int? = ((error as? JsonObject)?.get("code") as? JsonPrimitive)?.intOrNull

private val PASSING_STATUSES = setOf(401, 403, 408, 425, 429)

private val ABOUT_THE_CALL = setOf(-32600, -32601, -32602)
