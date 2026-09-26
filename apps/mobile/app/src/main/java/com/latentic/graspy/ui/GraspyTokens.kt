// graspy-tokens source=be2a6c31f90b885d96c8b48d81ded6626884a4f474c44e2c88f9e47502982224 content=830a389e4b8b4f63d1ad531d33f8e2d4254231b5e7847735a191f12283fa9d0f
// Generated from content/design/tokens.json; do not edit. Regenerate: node content/design/build.mjs
@file:OptIn(ExperimentalTextApi::class)

package com.latentic.graspy.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.latentic.graspy.R

object GraspyColor {
    /** Page ground behind cards. */
    val Canvas = Color(0xFFF5F8FA)
    /** Cards, sheets, the tab bar. */
    val Surface = Color(0xFFFFFFFF)
    /** A quiet band inside a card. */
    val Raised = Color(0xFFF9FBFC)
    /** Any text. 16.1:1; 15.1:1 on canvas. */
    val Ink = Color(0xFF12232E)
    /** Secondary text. 5.9:1; 5.5:1 on canvas. */
    val Muted = Color(0xFF5A6672)
    /** Small print that still reads as text: 4.6:1 on white, 4.3:1 on canvas, so on canvas use muted. */
    val Subtle = Color(0xFF6B7682)
    /** Only for icons beside a label and other non-text: 3.05:1. */
    val Faint = Color(0xFF8A95A0)
    /** Card borders and dividers. */
    val Line = Color(0xFFE5E9EE)
    /** The empty part of a progress bar. */
    val Track = Color(0xFFEEF1F4)
    /** The brand blue. 3.4:1: fills, borders, focus rings and button labels, never body text. */
    val Accent = Color(0xFF2893C8)
    /** A pressed or hovered accent fill. 5.5:1. */
    val AccentStrong = Color(0xFF1F7099)
    /** Blue text and links. 5.5:1; 4.9:1 on accent-soft. */
    val AccentInk = Color(0xFF1F6F9C)
    /** A selected row, the selected tab's pill, the tutor's ground. */
    val AccentSoft = Color(0xFFEAF4FA)
    /** The border of an accent-soft area. */
    val AccentLine = Color(0xFFCFE7F3)
    /** Text and icons on an accent fill. */
    val OnAccent = Color(0xFFFFFFFF)
    /** Right or finished, and nothing else. 5.6:1; 5.0:1 on success-soft. */
    val Success = Color(0xFF0F7838)
    /** The ground of a right answer or a finished topic. */
    val SuccessSoft = Color(0xFFEAF7E4)
    /** Dark enough for small text: 5.4:1; 4.8:1 on warning-soft. */
    val Warning = Color(0xFF8A6416)
    /** The ground of a caution. */
    val WarningSoft = Color(0xFFFDF3D6)
    /** The border of a warning-soft area. */
    val WarningLine = Color(0xFFF3DE9A)
    /** Errors and destructive actions. 5.4:1; 4.7:1 on danger-soft. */
    val Danger = Color(0xFFC0392B)
    /** The ground of an error. */
    val DangerSoft = Color(0xFFFBEBE8)
    /** Subject tiles only; never for text. */
    val TintGreen = Color(0xFF2F9E6E)
    /** Subject tiles only. */
    val TintGreenSoft = Color(0xFFE6F6EE)
    /** Subject tiles only; never for text. */
    val TintOrange = Color(0xFFD9772B)
    /** Subject tiles only. */
    val TintOrangeSoft = Color(0xFFFDF0E4)
    /** Subject tiles only; never for text. */
    val TintPurple = Color(0xFF7057D1)
    /** Subject tiles only. */
    val TintPurpleSoft = Color(0xFFF0ECFC)
}

/** Headings. Poppins cannot stack a tone mark over a dot-below letter (Yoruba "ẹ́"), so Yoruba headings use sans. */
val DisplayFont = FontFamily(
    Font(R.font.poppins_medium, FontWeight.W500),
    Font(R.font.poppins_semibold, FontWeight.W600),
)

/** Body, labels and numbers. */
val SansFont = FontFamily(
    Font(R.font.inter_variable, FontWeight.W100, variationSettings = FontVariation.Settings(FontVariation.weight(100))),
    Font(R.font.inter_variable, FontWeight.W200, variationSettings = FontVariation.Settings(FontVariation.weight(200))),
    Font(R.font.inter_variable, FontWeight.W300, variationSettings = FontVariation.Settings(FontVariation.weight(300))),
    Font(R.font.inter_variable, FontWeight.W400, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.inter_variable, FontWeight.W500, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.inter_variable, FontWeight.W600, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.inter_variable, FontWeight.W700, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
    Font(R.font.inter_variable, FontWeight.W800, variationSettings = FontVariation.Settings(FontVariation.weight(800))),
    Font(R.font.inter_variable, FontWeight.W900, variationSettings = FontVariation.Settings(FontVariation.weight(900))),
)

object GraspyText {
    val Xs = TextStyle(fontSize = 12.sp, lineHeight = 16.sp)
    val Sm = TextStyle(fontSize = 14.sp, lineHeight = 20.sp)
    val Base = TextStyle(fontSize = 16.sp, lineHeight = 24.sp)
    val Lg = TextStyle(fontSize = 18.sp, lineHeight = 28.sp)
    val Xl = TextStyle(fontSize = 20.sp, lineHeight = 28.sp)
    val Xl2 = TextStyle(fontSize = 24.sp, lineHeight = 32.sp)
    val Xl3 = TextStyle(fontSize = 30.sp, lineHeight = 36.sp)
    val Xl4 = TextStyle(fontSize = 36.sp, lineHeight = 40.sp)
    val Hero = TextStyle(fontSize = 40.sp, lineHeight = 42.sp, letterSpacing = (-0.035).em)
    /** The number a voice lesson asks the learner to read, from arm's length. */
    val Numeral = TextStyle(fontSize = 64.sp, lineHeight = 72.sp, letterSpacing = (-0.015).em)
}

object GraspyRadius {
    /** Cards and sheets. */
    val Card = 12.dp
    /** Buttons, inputs and small tiles. */
    val Control = 8.dp
    /** Fully round: chips, the selected tab, progress bars. */
    val Pill = 9999.dp
}

/** One step of the spacing scale; a gap of n steps is n times this (the web's p-4 is 16px). */
val SpaceUnit = 4.dp

/** A gap of [steps] spacing steps: `space(4)` is the web's `p-4`. */
fun space(steps: Number): Dp = SpaceUnit * steps.toFloat()
