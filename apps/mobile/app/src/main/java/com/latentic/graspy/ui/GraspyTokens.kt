// graspy-tokens source=91e96bc945cffda91ee7c3babd9a1636b8198fb4305580bd2557e72b60d1572b content=310dcf4552d4f39ac641865fe1d8e4e671447659026a5789878e01c9ccf62823
// Generated from content/design/tokens.json; do not edit. Regenerate: node content/design/build.mjs
@file:OptIn(ExperimentalTextApi::class)

package com.latentic.graspy.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
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
    /** The brand blue. 5.5:1 under white labels: fills, borders, focus rings and button labels. Dark: 5.0:1 under white, 3.2:1 on a card. */
    val Accent = Color(0xFF1F7099)
    /** A pressed or hovered accent fill, and the lip under a button. 8.1:1. */
    val AccentStrong = Color(0xFF175573)
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
    /** Text on a danger fill. */
    val OnDanger = Color(0xFFFFFFFF)
    /** Where the art screens' ground starts, warm ivory at the left and top; light in dark mode too, because the picture on it is. */
    val ArtGroundStart = Color(0xFFFEF4EC)
    /** The middle of the art screens' ground; also the flat colour behind it where an image is not drawn. */
    val ArtGroundMid = Color(0xFFE3EEFA)
    /** Where the art screens' ground ends, pale blue at the right and foot. */
    val ArtGroundEnd = Color(0xFFC4E2FE)
    /** Text on the art screens' ground, from art-ground-start to art-ground-end. */
    val OnArt = Color(0xFF12232E)
}

/** Headings: the same family as the body, at 600. */
val DisplayFont = FontFamily(
    Font(R.font.ibm_plex_sans_regular, FontWeight.W400),
    Font(R.font.ibm_plex_sans_medium, FontWeight.W500),
    Font(R.font.ibm_plex_sans_semibold, FontWeight.W600),
)

/** Body and labels. */
val SansFont = FontFamily(
    Font(R.font.ibm_plex_sans_regular, FontWeight.W400),
    Font(R.font.ibm_plex_sans_medium, FontWeight.W500),
    Font(R.font.ibm_plex_sans_semibold, FontWeight.W600),
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

/** The radii that follow the learner's age band. */
class GraspyRadii(val card: Dp, val control: Dp)

val ChildRadii = GraspyRadii(card = 18.dp, control = 12.dp)
val TweenRadii = GraspyRadii(card = 12.dp, control = 8.dp)
val TeenRadii = GraspyRadii(card = 8.dp, control = 6.dp)

/** The tween look until the learner's class is known. */
val LocalGraspyRadii = staticCompositionLocalOf { TweenRadii }

object GraspyRadius {
    /** Cards and tiles. The value is the tween look; child and teen learners get the radius under age (web) or androidAge (Android). */
    val Card: Dp @Composable @ReadOnlyComposable get() = LocalGraspyRadii.current.card
    /** Buttons and inputs. The value is the tween look; child and teen learners get the radius under age (web) or androidAge (Android). */
    val Control: Dp @Composable @ReadOnlyComposable get() = LocalGraspyRadii.current.control
    /** Fully round: chips, the selected tab, progress bars. */
    val Pill = 9999.dp
    /** Chips and small marks inside a control. */
    val Small = 8.dp
    /** Dialogs, the onboarding card and other large surfaces. */
    val Sheet = 28.dp
}

/** One step of the spacing scale; a gap of n steps is n times this (the web's p-4 is 16px). */
val SpaceUnit = 4.dp

/** A gap of [steps] spacing steps: `space(4)` is the web's `p-4`. */
fun space(steps: Number): Dp = SpaceUnit * steps.toFloat()
