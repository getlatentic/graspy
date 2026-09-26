package com.latentic.graspy.network

import retrofit2.HttpException

/**
 * The server's code for a refusal, such as `too_many_learners` or `step_not_offered`. Voice refusals
 * carry it at the top level and session refusals inside `detail`; either is read.
 */
fun refusalCode(body: String?): String? = body?.let { REFUSAL_CODE.find(it)?.groupValues?.get(1) }

/** Peeked, so the body is still there for anything else that reads it. */
fun refusalCode(error: Throwable): String? =
    refusalCode((error as? HttpException)?.response()?.errorBody()?.source()?.peek()?.readUtf8())

private val REFUSAL_CODE = Regex(""""code"\s*:\s*"([a-z_]+)"""")
