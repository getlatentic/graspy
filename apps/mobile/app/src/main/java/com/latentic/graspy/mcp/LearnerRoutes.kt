package com.latentic.graspy.mcp

import android.content.SharedPreferences
import android.util.Log
import androidx.core.content.edit
import com.latentic.graspy.plan.LearnerDetails
import com.latentic.graspy.plan.LearnerPlan
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * The class a plan names, as the server's learner_route tool reads it: the catalogue's system and level, or, for a
 * plan from before plans kept them, only the level the server reads.
 */
data class ClassAsk(val system: String?, val level: String?, val gradeLevel: String?) {
    val key: String get() = "${system.orEmpty()}|${level.orEmpty()}|${gradeLevel.orEmpty()}"

    fun arguments(): JsonObject = buildJsonObject {
        system?.takeIf(String::isNotBlank)?.let { put("system", it) }
        level?.takeIf(String::isNotBlank)?.let { put("level", it) }
        gradeLevel?.takeIf(String::isNotBlank)?.let { put("gradeLevel", it) }
    }
}

fun LearnerPlan.classAsk() = ClassAsk(system, level, gradeLevel)

fun LearnerDetails.classAsk() = ClassAsk(system, level, gradeLevel)

/**
 * Whether the learner learns by voice alone, with no slide subjects, as the web's learner-route: the server decides
 * (app/learner/route.py), asked through MCP, and its last answer for each class is kept with the learner's plan for
 * when there is no connection.
 */
class LearnerRoutes(
    private val read: suspend (String, JsonObject) -> JsonObject,
    private val preferences: SharedPreferences,
    ownerId: String,
) {
    private val prefix = "route:$ownerId:"
    private val shown = MutableStateFlow(keptAnswers())

    /** The answers known, by [ClassAsk.key]. */
    val answers: StateFlow<Map<String, Boolean>> = shown.asStateFlow()

    fun keep(ask: ClassAsk, voiceOnly: Boolean) {
        preferences.edit { putBoolean(prefix + ask.key, voiceOnly) }
        shown.update { it + (ask.key to voiceOnly) }
    }

    /** The server's answer, kept; without one, the answer kept before, or null before any. */
    suspend fun ask(ask: ClassAsk): Boolean? {
        val answer = try {
            read(TOOL, ask.arguments()).takeUnless { it.isToolError() }?.voiceOnly()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "Asking the learner's route failed", error)
            null
        }
        answer?.let { keep(ask, it) }
        return answer ?: shown.value[ask.key]
    }

    private fun JsonObject.voiceOnly(): Boolean? =
        (this["structuredContent"] as? JsonObject)?.get("voiceOnly")?.jsonPrimitive?.booleanOrNull

    private fun keptAnswers(): Map<String, Boolean> =
        preferences.all.mapNotNull { (key, value) -> if (key.startsWith(prefix) && value is Boolean) key.removePrefix(prefix) to value else null }.toMap()

    private companion object {
        const val TOOL = "learner_route"
        const val TAG = "GraspyRoute"
    }
}
