package com.latentic.graspy.subjects

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.icons.Lucide
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space

/** A subject tile's colours: the one place a tint other than the brand blue appears. */
enum class SubjectTint(val ground: Color, val ink: Color) {
    BLUE(GraspyColor.AccentSoft, GraspyColor.AccentInk),
    GREEN(GraspyColor.TintGreenSoft, GraspyColor.TintGreen),
    ORANGE(GraspyColor.TintOrangeSoft, GraspyColor.TintOrange),
    PURPLE(GraspyColor.TintPurpleSoft, GraspyColor.TintPurple),
}

// As the web's features/learn/lib/subject-icons.ts: subject names are an open set, so keywords are
// matched in order and the first wins ("English Language" is a book).
private val SUBJECTS: List<Triple<List<String>, Lucide, SubjectTint>> = listOf(
    Triple(listOf("analysis", "calculus", "further math"), Lucide.Sigma, SubjectTint.BLUE),
    Triple(listOf("math", "algebra", "geometry", "statistic", "arithmetic", "trigonometry"), Lucide.Pi, SubjectTint.BLUE),
    Triple(listOf("english", "literature", "reading"), Lucide.BookOpen, SubjectTint.ORANGE),
    Triple(listOf("language", "grammar", "writing"), Lucide.Languages, SubjectTint.ORANGE),
    Triple(listOf("history", "government", "civic"), Lucide.Landmark, SubjectTint.PURPLE),
    Triple(listOf("chemistry", "science"), Lucide.FlaskConical, SubjectTint.GREEN),
    Triple(listOf("physics"), Lucide.Atom, SubjectTint.GREEN),
    Triple(listOf("biology", "health"), Lucide.Dna, SubjectTint.GREEN),
    Triple(listOf("geography", "social studies"), Lucide.Globe, SubjectTint.GREEN),
    Triple(listOf("economic", "commerce"), Lucide.TrendingUp, SubjectTint.BLUE),
    Triple(listOf("account", "business", "financial"), Lucide.Calculator, SubjectTint.BLUE),
    Triple(listOf("law", "justice"), Lucide.Scale, SubjectTint.PURPLE),
    Triple(listOf("computer", "ict", "technology", "coding"), Lucide.Laptop, SubjectTint.PURPLE),
    Triple(listOf("agric", "farming"), Lucide.Wheat, SubjectTint.GREEN),
    Triple(listOf("physical education", "sport"), Lucide.Dumbbell, SubjectTint.GREEN),
    Triple(listOf("art", "design", "craft"), Lucide.Palette, SubjectTint.ORANGE),
    Triple(listOf("music"), Lucide.Music, SubjectTint.ORANGE),
    Triple(listOf("religio", "islamic", "christian", "moral"), Lucide.BookMarked, SubjectTint.PURPLE),
)

private fun match(name: String) = name.lowercase().let { key -> SUBJECTS.firstOrNull { (words) -> words.any(key::contains) } }

fun subjectIcon(name: String): Lucide = match(name)?.second ?: Lucide.GraduationCap

/** Stable per name, as the web's, so unknown subjects do not all share one colour. */
fun subjectTint(name: String): SubjectTint = match(name)?.third ?: run {
    val hash = name.codePoints().toArray().fold(0L) { hash, point -> (hash * 31 + point) and 0xFFFFFFFFL }
    SubjectTint.entries[(hash % SubjectTint.entries.size).toInt()]
}

@Composable
fun SubjectBadge(name: String, modifier: Modifier = Modifier, size: Dp = space(10), shape: Shape = CircleShape) {
    val tint = subjectTint(name)
    Box(modifier.size(size).background(tint.ground, shape), contentAlignment = Alignment.Center) {
        Icon(rememberLucide(subjectIcon(name)), contentDescription = null, tint = tint.ink, modifier = Modifier.size(size / 2))
    }
}
