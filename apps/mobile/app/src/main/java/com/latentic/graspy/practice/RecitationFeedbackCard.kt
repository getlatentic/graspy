package com.latentic.graspy.practice

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.LessonCopy
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.Nunito
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

data class FactLine(val fact: String, val note: String?)

private fun LessonCopy.fact(exercise: PracticeExercise.FactAnswer, template: String): String = template.format(
    Curriculum.NUMBER_WORDS.getValue(exercise.table),
    Curriculum.NUMBER_WORDS.getValue(exercise.multiplier),
    numberWords(exercise.expected),
)

/**
 * The teacher's spoken result for a turn.
 *
 * The teacher composes what it says about this child's answer and the server sends those words, so
 * they are what the child reads and hears. The stored sentences remain for a turn that reaches the
 * screen without having been marked, which is the only case the teacher has not spoken for.
 */
internal fun feedbackText(copy: AppCopy, turn: LessonTurn, decision: PracticeDecision): String {
    turn.outcome?.feedback?.takeIf { it.isNotBlank() }?.let { return it }
    val lesson = copy.lesson.forTable(turn.table)
    return when (val exercise = turn.exercise) {
        is PracticeExercise.FactAnswer -> when (decision) {
            PracticeDecision.CORRECT -> lesson.correctShort
            PracticeDecision.TRY_AGAIN -> lesson.fact(exercise, lesson.learnFact)
            PracticeDecision.NOT_UNDERSTOOD -> copy.notUnderstoodFeedback
        }
        is PracticeExercise.TimesTableRecitation -> when (decision) {
            PracticeDecision.CORRECT -> lesson.correctShort
            PracticeDecision.TRY_AGAIN -> lesson.retryFacts
            PracticeDecision.NOT_UNDERSTOOD -> lesson.notUnderstoodFeedback
        }
        else -> when (decision) {
            PracticeDecision.CORRECT -> lesson.correctShort
            PracticeDecision.TRY_AGAIN -> lesson.tryAgain
            PracticeDecision.NOT_UNDERSTOOD -> copy.notUnderstoodFeedback
        }
    }
}

/** Facts a targeted retry asks for, as chips under the teacher's note. */
internal fun requestedFactLines(exercise: PracticeExercise.TimesTableRecitation): List<FactLine> =
    exercise.multipliers.map { FactLine("${exercise.table} × $it", null) }

internal fun recitationSummary(copy: LessonCopy, exercise: PracticeExercise.TimesTableRecitation, result: RecitationResult): String =
    copy.factsCorrectTemplate.format(result.correctMultipliers.size, exercise.multipliers.count())

internal fun missingFactLines(exercise: PracticeExercise.TimesTableRecitation, result: RecitationResult): List<FactLine> =
    result.missingMultipliers.map { FactLine("${exercise.table} × $it", null) }

internal fun uncertainFactLines(exercise: PracticeExercise.TimesTableRecitation, result: RecitationResult): List<FactLine> =
    result.uncertainMultipliers.map { FactLine("${exercise.table} × $it", null) }

internal fun incorrectFactLines(copy: LessonCopy, exercise: PracticeExercise.TimesTableRecitation, result: RecitationResult): List<FactLine> =
    result.incorrectFacts.map {
        FactLine("${exercise.table} × ${it.multiplier}", copy.heardTemplate.format(it.heard, it.expected))
    }

/** One segment per fact: green said correctly, red wrong, sun not sure, grey not heard. */
internal fun factSegments(exercise: PracticeExercise.TimesTableRecitation, result: RecitationResult): List<Color> =
    exercise.multipliers.map { m ->
        when {
            m in result.correctMultipliers -> Graspy.Success
            result.incorrectFacts.any { it.multiplier == m } -> Graspy.Danger
            m in result.uncertainMultipliers -> Graspy.Warning
            else -> Graspy.Border
        }
    }

/** The design's quiz-result card: eyebrow, "10 of 12 said correctly", segmented bar, then the facts. */
@Composable
fun RecitationFeedbackCard(
    copy: LessonCopy,
    exercise: PracticeExercise.TimesTableRecitation,
    decision: PracticeDecision,
    result: RecitationResult?,
) {
    if (result == null) return
    val shape = RoundedCornerShape(14.dp)
    Column(
        Modifier.fillMaxWidth().background(Graspy.Background, shape).border(BorderStroke(1.dp, Graspy.Hairline), shape).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(copy.resultEyebrow.uppercase(), color = Graspy.AccentText, style = MaterialTheme.typography.labelMedium)
        Text(recitationSummary(copy, exercise, result), color = Graspy.Text, style = MaterialTheme.typography.headlineSmall)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            factSegments(exercise, result).forEach { color ->
                Box(Modifier.weight(1f).height(7.dp).background(color, RoundedCornerShape(4.dp)))
            }
        }
        FactChips(copy.uncertainFacts, uncertainFactLines(exercise, result), Graspy.WarningSurface, Graspy.WarningText)
        FactChips(copy.missingFacts, missingFactLines(exercise, result), Graspy.Background, Graspy.TextMuted)
        FactChips(copy.wrongFacts, incorrectFactLines(copy, exercise, result), Graspy.DangerSurface, Graspy.Danger)
    }
}

/** One fact's result: the maths line, and what the learner said when it was wrong. */
@Composable
fun FactResultCard(copy: LessonCopy, exercise: PracticeExercise.FactAnswer, outcome: PracticeOutcome) {
    val shape = RoundedCornerShape(14.dp)
    val wrong = outcome.decision == PracticeDecision.TRY_AGAIN && outcome.parsedAnswer != null
    Column(
        Modifier.fillMaxWidth().background(Graspy.Background, shape).border(BorderStroke(1.dp, Graspy.Hairline), shape).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(copy.factResultEyebrow.uppercase(), color = Graspy.AccentText, style = MaterialTheme.typography.labelMedium)
        Text("${exercise.table} × ${exercise.multiplier} = ${exercise.expected}", color = if (wrong) Graspy.Danger else Graspy.Text, style = MaterialTheme.typography.headlineSmall)
        if (wrong) Text(copy.youSaid.format(outcome.parsedAnswer), color = Graspy.TextMuted, fontFamily = Nunito, fontSize = 13.sp)
    }
}

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

/** The sequence result card: said in order in green, early in sun, not said in grey. */
@Composable
fun SequenceResultCard(copy: LessonCopy, result: SequenceResult) {
    val shape = RoundedCornerShape(14.dp)
    val total = result.said.size + result.missing.size + result.outOfOrder.size
    Column(
        Modifier.fillMaxWidth().background(Graspy.Background, shape).border(BorderStroke(1.dp, Graspy.Hairline), shape).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(copy.factResultEyebrow.uppercase(), color = Graspy.AccentText, style = MaterialTheme.typography.labelMedium)
        Text(copy.factsCorrectTemplate.format(result.said.size, total), color = Graspy.Text, style = MaterialTheme.typography.headlineSmall)
        FactChips(copy.uncertainFacts, result.outOfOrder.map { FactLine(it, null) }, Graspy.WarningSurface, Graspy.WarningText)
        FactChips(copy.missingFacts, result.missing.map { FactLine(it, null) }, Graspy.Background, Graspy.TextMuted)
    }
}

@Composable
internal fun FactChips(title: String, lines: List<FactLine>, chip: Color, text: Color) {
    if (lines.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (title.isNotEmpty()) Text(title, color = Graspy.TextCaption, fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            lines.forEach { line ->
                Row(
                    Modifier.background(chip, RoundedCornerShape(999.dp)).padding(horizontal = 10.dp, vertical = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(line.fact, color = text, fontFamily = Nunito, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    if (line.note != null) Text(line.note, color = text, fontFamily = Nunito, fontSize = 13.sp)
                }
            }
        }
    }
}
