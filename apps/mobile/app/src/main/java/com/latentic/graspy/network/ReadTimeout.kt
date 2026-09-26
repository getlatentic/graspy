package com.latentic.graspy.network

import java.util.concurrent.TimeUnit
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/** How long a request may go quiet: a tutor's stream is silent while it works a tool. */
data class ReadTimeout(val seconds: Long)

fun Request.Builder.readTimeout(seconds: Long): Request.Builder = tag(ReadTimeout::class.java, ReadTimeout(seconds))

object ReadTimeoutInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val timeout = chain.request().tag(ReadTimeout::class.java) ?: return chain.proceed(chain.request())
        return chain.withReadTimeout(timeout.seconds.toInt(), TimeUnit.SECONDS).proceed(chain.request())
    }
}
