package com.latentic.graspy.network

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import retrofit2.HttpException

/**
 * The server's code for a refusal, such as `too_many_learners` or `step_not_offered`. Voice refusals
 * carry it at the top level and session refusals inside `detail`; either is read.
 */
fun refusalCode(body: String?): String? = body?.let { REFUSAL_CODE.find(it)?.groupValues?.get(1) }

/** Peeked, so the body is still there for anything else that reads it. */
fun refusalCode(error: Throwable): String? = refusalCode(peekedBody(error))

/**
 * Whether a refusal carries the body graspy's own routes refuse with: JSON with `detail` or `code`. FastAPI
 * answers a path it has no route for, such as one mid-deploy, with {"detail": "Not Found"}. A refusal without
 * graspy's body came from something in the way: a proxy, a CDN.
 */
fun fromGraspy(status: Int, body: String?): Boolean {
    val answer = body?.let(::jsonObjectOf) ?: return false
    if ("detail" !in answer && "code" !in answer) return false
    return !(status == NOT_FOUND && (answer["detail"] as? JsonPrimitive)?.contentOrNull == "Not Found")
}

/** Peeked, as [refusalCode] is. */
fun fromGraspy(error: HttpException): Boolean = fromGraspy(error.code(), peekedBody(error))

private fun peekedBody(error: Throwable): String? =
    (error as? HttpException)?.response()?.errorBody()?.source()?.peek()?.readUtf8()

private fun jsonObjectOf(body: String): JsonObject? = try {
    Json.parseToJsonElement(body) as? JsonObject
} catch (unreadable: SerializationException) {
    null
}

private val REFUSAL_CODE = Regex(""""code"\s*:\s*"([a-z_]+)"""")

private const val NOT_FOUND = 404
