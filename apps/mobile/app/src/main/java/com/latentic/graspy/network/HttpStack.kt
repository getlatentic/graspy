package com.latentic.graspy.network

import android.content.Context
import android.util.Log
import com.google.android.gms.net.CronetProviderInstaller
import com.google.net.cronet.okhttptransport.CronetInterceptor
import com.latentic.graspy.BuildConfig
import kotlinx.coroutines.CompletableDeferred
import okhttp3.Call
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.chromium.net.CronetEngine

/** OkHttp until Play services' Cronet is installed, then Cronet with HTTP/3 to the API. */
class HttpStack(context: Context, base: OkHttpClient) {
    @Volatile
    private var client: OkHttpClient = base
    private val ready = CompletableDeferred<Unit>()

    val callFactory: Call.Factory = Call.Factory { request: Request -> client.newCall(request) }

    init {
        CronetProviderInstaller.installProvider(context)
            .addOnSuccessListener {
                runCatching { client = base.withCronet(context) }
                    .onSuccess { Log.i(TAG, "Cronet installed; HTTP/3 available") }
                    .onFailure { Log.w(TAG, "Cronet unusable; staying on OkHttp", it) }
                ready.complete(Unit)
            }
            .addOnFailureListener {
                Log.i(TAG, "Cronet unavailable; staying on OkHttp: ${it.message}")
                ready.complete(Unit)
            }
    }

    suspend fun awaitReady() = ready.await()

    private fun OkHttpClient.withCronet(context: Context): OkHttpClient {
        val engine = CronetEngine.Builder(context)
            .enableQuic(true)
            .enableHttp2(true)
            .apply { host()?.let { addQuicHint(it, HTTPS, HTTPS) } }
            .build()
        return newBuilder()
            .addInterceptor { chain ->
                chain.proceed(chain.request()).also { response ->
                    Log.i(TAG, "${response.protocol} ${response.code} ${chain.request().url.encodedPath}")
                }
            }
            .addInterceptor(CronetInterceptor.newBuilder(engine).build())
            .build()
    }

    private fun host(): String? =
        BuildConfig.API_BASE_URL.toHttpUrlOrNull()?.takeIf { it.isHttps }?.host

    private companion object {
        const val TAG = "GraspyHttp"
        const val HTTPS = 443
    }
}
