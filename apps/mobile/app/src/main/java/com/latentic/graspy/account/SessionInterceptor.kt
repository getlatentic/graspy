package com.latentic.graspy.account

import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/** The learner a request is made for. It is refused rather than sent as another learner. */
data class RequestLearner(val key: String)

/**
 * Sends the graspy session with every request, and on a 401 exchanges the sign-in for a new session
 * and sends the request once more. It must come before the transport: Cronet answers the request
 * itself, so OkHttp's own authenticator would never see the 401.
 */
class SessionInterceptor(
    private val sessions: SessionTokens,
    private val learnerInUse: () -> String?,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val token = session { token() }
        requireLearner(request)
        val response = chain.proceed(request.bearing(token))
        if (response.code != UNAUTHORIZED) return response
        response.close()
        val renewed = session { renew(token) }
        requireLearner(request)
        return chain.proceed(request.bearing(renewed))
    }

    /** OkHttp fails a call cleanly only on an IOException, so an exchange refused over HTTP becomes one. */
    private fun session(get: suspend SessionTokens.() -> String): String = try {
        runBlocking { sessions.get() }
    } catch (error: IOException) {
        throw error
    } catch (error: CancellationException) {
        throw IOException("The session exchange was cancelled", error)
    } catch (error: Exception) {
        throw IOException("graspy did not issue a session: ${error.message}", error)
    }

    private fun requireLearner(request: Request) {
        val wanted = request.tag(RequestLearner::class.java)?.key ?: return
        if (wanted != learnerInUse()) throw IOException("That learner is no longer learning on this device")
    }

    private fun Request.bearing(token: String): Request =
        newBuilder().header("Authorization", "Bearer $token").build()

    private companion object {
        const val UNAUTHORIZED = 401
    }
}
