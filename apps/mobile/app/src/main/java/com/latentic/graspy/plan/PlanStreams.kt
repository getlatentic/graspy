package com.latentic.graspy.plan

import com.latentic.graspy.network.readServerEvents
import com.latentic.graspy.network.readTimeout
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import okhttp3.Call
import okhttp3.HttpUrl
import okhttp3.Request

/** A plan to make: English names, as the server and the model read them. */
data class CurriculumRequest(val country: String, val language: String, val gradeLevel: String?, val subjects: List<String>)

data class GeneratedSubject(val id: String, val label: String, val recommended: Boolean)

/** The server answered, but not with what was asked; [retryable] when trying again may help. */
class PlanStreamFailed(message: String, val retryable: Boolean) : IOException(message)

/** The curriculum and subject streams the web's onboarding reads (curriculum and subjects generate-stream). */
class PlanStreams(private val calls: Call.Factory, private val api: HttpUrl) {
    /** Each result as it arrives; the stream's own error message, if it sent one. */
    suspend fun curriculum(request: CurriculumRequest, onResult: (JsonObject) -> Unit): String? {
        val url = api.newBuilder().addPathSegments("api/curriculum/generate-stream")
            .addQueryParameter("country", request.country)
            .addQueryParameter("language", request.language)
            .apply { request.gradeLevel?.takeIf { it.isNotBlank() }?.let { addQueryParameter("gradeLevel", it) } }
            .apply { request.subjects.forEach { addQueryParameter("subject", it) } }
            .build()
        return stream(url) { event -> if (event.type() == "result") onResult(event) }
    }

    /** The subjects taught at this level, as they arrive, without repeats. */
    suspend fun subjects(country: String, language: String, gradeLevel: String, onSubjects: (List<GeneratedSubject>) -> Unit): String? {
        val url = api.newBuilder().addPathSegments("api/subjects/generate-stream")
            .addQueryParameter("country", country)
            .addQueryParameter("language", language)
            .apply { gradeLevel.takeIf { it.isNotBlank() }?.let { addQueryParameter("gradeLevel", it) } }
            .build()
        val found = LinkedHashMap<String, GeneratedSubject>()
        return stream(url) { event ->
            if (event.type() != "subjects") return@stream
            (event["subjects"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonObject)?.let(::subjectOf) }
                .filter { it.id !in found }
                .forEach { found[it.id] = it }
            onSubjects(found.values.toList())
        }
    }

    private suspend fun stream(url: HttpUrl, onEvent: (JsonObject) -> Unit): String? = withContext(Dispatchers.IO) {
        var failure: String? = null
        val call = calls.newCall(Request.Builder().url(url).header("Accept", "text/event-stream").readTimeout(READ_SECONDS).build())
        val stop = currentCoroutineContext()[Job]?.invokeOnCompletion { if (it is CancellationException) call.cancel() }
        try {
            call.execute().use { response ->
                if (!response.isSuccessful) throw PlanStreamFailed("HTTP ${response.code}", retryable = response.code >= 500)
                readServerEvents(response.body.source()) { event ->
                    if (event.type() == "error") failure = event.text("message") ?: "The stream failed" else onEvent(event)
                }
            }
        } finally {
            stop?.dispose()
        }
        failure
    }

    private fun subjectOf(value: JsonObject): GeneratedSubject? {
        val id = value.text("id") ?: return null
        return GeneratedSubject(id, value.text("label") ?: id, (value["recommended"] as? JsonPrimitive)?.booleanOrNull == true)
    }

    private fun JsonObject.type() = text("type")

    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull

    private companion object {
        const val READ_SECONDS = 120L
    }
}
