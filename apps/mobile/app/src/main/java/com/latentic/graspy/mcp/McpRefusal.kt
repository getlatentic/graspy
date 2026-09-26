package com.latentic.graspy.mcp

import com.latentic.graspy.account.SessionRefusal
import java.io.IOException
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

/** A 4xx, except a timeout, a rate limit or one about the session, such as 413 for a body over the server's limit. */
internal fun refusedOverHttp(status: Int): Boolean = status in 400..499 && status !in PASSING_STATUSES

/** JSON-RPC's invalid request, method not found and invalid params: sent again, the call would be refused again. */
internal fun refusedOverRpc(error: JsonElement): Boolean =
    ((error as? JsonObject)?.get("code") as? JsonPrimitive)?.intOrNull in ABOUT_THE_CALL

private val PASSING_STATUSES = setOf(401, 403, 408, 425, 429)

private val ABOUT_THE_CALL = setOf(-32600, -32601, -32602)
