package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.apiJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

/** A plan sequence as the Worker marked it: what was said in order, what was missing or early. */
@Serializable
data class SequenceResult(
    val said: List<String>,
    val missing: List<String>,
    @SerialName("out_of_order") val outOfOrder: List<String> = emptyList(),
) {
    companion object {
        fun fromJson(json: String?): SequenceResult? {
            if (json.isNullOrBlank()) return null
            return try {
                apiJson.decodeFromString(serializer(), json)
            } catch (error: SerializationException) {
                null
            } catch (error: IllegalArgumentException) {
                null
            }
        }
    }
}

