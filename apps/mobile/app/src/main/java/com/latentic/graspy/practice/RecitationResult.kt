package com.latentic.graspy.practice

import com.latentic.graspy.collection.outbox.apiJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

@Serializable
data class IncorrectFact(
    val multiplier: Int,
    val expected: Int,
    val heard: Int,
)

/** One fact as the Worker parsed it, in recitation order, with its LaTeX form. */
@Serializable
data class HeardFact(
    val multiplier: Int,
    val heard: Int? = null,
    val latex: String,
) {
    /** LaTeX rendered for on-screen display with real operator glyphs. */
    val display: String get() = latex.replace("\\times", "\u00d7").replace("\\cdot", "\u00b7")
}

/** Fact-level outcome of one times-table recitation, exactly as the Worker decided it. */
@Serializable
data class RecitationResult(
    @SerialName("correct_multipliers") val correctMultipliers: List<Int>,
    @SerialName("missing_multipliers") val missingMultipliers: List<Int>,
    @SerialName("incorrect_facts") val incorrectFacts: List<IncorrectFact> = emptyList(),
    @SerialName("heard_facts") val heardFacts: List<HeardFact> = emptyList(),
    @SerialName("uncertain_multipliers") val uncertainMultipliers: List<Int> = emptyList(),
) {
    fun toJson(): String = apiJson.encodeToString(serializer(), this)

    companion object {
        fun fromJson(json: String?): RecitationResult? {
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
