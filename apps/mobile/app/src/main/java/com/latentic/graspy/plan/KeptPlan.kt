package com.latentic.graspy.plan

import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.serialization.json.jsonObject

/**
 * A learner's plan and record, kept on the phone for when there is no connection. The file is the device's and
 * is wiped when it leaves a learner; each learner's plan sits under their own keys, so a write that lands after
 * a switch is never read as the next learner's, and none is made once the device has left them.
 */
class KeptPlan(
    private val preferences: SharedPreferences,
    ownerId: String,
    private val stillLearning: () -> Boolean,
) {
    private val planKey = "plan:$ownerId"
    private val recordKey = "record:$ownerId"

    init {
        if (UNOWNED_KEYS.any(preferences::contains)) preferences.edit { UNOWNED_KEYS.forEach(::remove) }
    }

    fun read(): PlanState.Ready? {
        val plan = preferences.getString(planKey, null) ?: return null
        return runCatching {
            val record = preferences.getString(recordKey, null)?.let { planJson.decodeFromString<LearnerRecord>(it) } ?: LearnerRecord()
            PlanState.Ready(LearnerPlan.of(planJson.parseToJsonElement(plan).jsonObject), record)
        }.getOrNull()
    }

    fun keep(ready: PlanState.Ready) {
        if (!stillLearning()) return
        preferences.edit {
            putString(planKey, ready.plan.toJson().toString())
            putString(recordKey, planJson.encodeToString(LearnerRecord.serializer(), ready.record))
        }
    }

    private companion object {
        // Keys an installed older version kept one plan under, whoever's it was.
        val UNOWNED_KEYS = listOf("plan", "record")
    }
}
