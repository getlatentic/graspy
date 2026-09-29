package com.latentic.graspy.account

import com.latentic.graspy.network.refusalCode
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/** The learner a request is made for. It is refused rather than sent as another learner. */
data class RequestLearner(val key: String)

/**
 * The session was refused, by graspy, by Google or because the request's learner is no longer in use.
 * OkHttp fails a call only on an IOException, but no connection was lost: nothing stands in for the answer.
 */
class SessionRefusal(message: String, cause: Throwable? = null) : IOException(message, cause)

/**
 * Sends the graspy session with every request. On a 401, or a 409 saying the session names no learner
 * while the device learns as one, it exchanges the sign-in for a new session and sends the request once
 * more. The exchange follows the learner: one removed elsewhere is left, and the device asks who is
 * learning. It must come before the transport: Cronet answers the request itself, so OkHttp's own
 * authenticator would never see the 401.
 */
class SessionInterceptor(
    private val sessions: SessionTokens,
    private val learnerInUse: () -> String?,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        // Before the token, so none is fetched for a learner already gone; after it, so the token is theirs.
        requireLearner(request)
        val token = session { token() }
        requireLearner(request)
        val response = chain.proceed(request.bearing(token))
        if (!needsNewSession(response)) return response
        response.close()
        requireLearner(request)
        val renewed = session { renew(token) }
        requireLearner(request)
        return chain.proceed(request.bearing(renewed))
    }

    /** OkHttp fails a call cleanly only on an IOException, so an exchange refused over HTTP becomes a [SessionRefusal]. */
    private fun session(get: suspend SessionTokens.() -> String): String = try {
        runBlocking { sessions.get() }
    } catch (error: IOException) {
        throw error
    } catch (error: CancellationException) {
        throw IOException("The session exchange was cancelled", error)
    } catch (error: Exception) {
        throw SessionRefusal("graspy did not issue a session: ${error.message}", error)
    }

    private fun needsNewSession(response: Response): Boolean = when (response.code) {
        UNAUTHORIZED -> refusalCode(response.peekBody(REFUSAL_BYTES).string()) !in REFUSED_SIGN_INS
        CONFLICT -> learnerInUse() != null && refusalCode(response.peekBody(REFUSAL_BYTES).string()) == LEARNER_REQUIRED
        else -> false
    }

    private fun requireLearner(request: Request) {
        val wanted = request.tag(RequestLearner::class.java)?.key ?: return
        if (wanted != learnerInUse()) throw SessionRefusal("That learner is no longer learning on this device")
    }

    private fun Request.bearing(token: String): Request =
        newBuilder().header("Authorization", "Bearer $token").build()

    private companion object {
        const val UNAUTHORIZED = 401
        const val CONFLICT = 409
        const val LEARNER_REQUIRED = "learner_required"
        const val REFUSAL_BYTES = 4_096L

        /**
         * A 401 that refuses the sign-in a request carries (a parent's agreement), not the session. Sending it again
         * under a new session sends the same sign-in, which the server refuses the same way.
         */
        val REFUSED_SIGN_INS = setOf("sign_in_stale", "sign_in_invalid")
    }
}
