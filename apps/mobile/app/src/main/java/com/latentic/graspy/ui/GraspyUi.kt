package com.latentic.graspy.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.latentic.graspy.R

/** Graspy brand tokens from the Claude Design brand guidelines: blue acts, green grows, ink reads. */
object Graspy {
    val Background = Color(0xFFF5F8FA)
    val Surface = Color.White
    val Border = Color(0xFFE5E9EE)
    val Hairline = Color(0xFFEEF1F4)
    val Text = Color(0xFF12232E)
    val TextMuted = Color(0xFF5A6672)
    val TextCaption = Color(0xFF8B96A3)
    val NonText = Color(0xFF9AA4AF)
    val Brand = Color(0xFF2893C8)
    val Action = Color(0xFF2893C8)
    val ActionPressed = Color(0xFF1F7099)
    val OnAction = Color.White
    val AccentSurface = Color(0xFFEAF4FA)
    val AccentBorder = Color(0xFFCFE7F3)
    val AccentText = Color(0xFF1F6F9C)
    val Success = Color(0xFF3FAE3F)
    val SuccessDeep = Color(0xFF0F7838)
    val SuccessSurface = Color(0xFFEAF7E4)
    val SuccessBorder = Color(0xFFD5EDC7)
    val SuccessText = Color(0xFF2C4A1E)
    val Warning = Color(0xFFF7C700)
    val WarningSurface = Color(0xFFFDF3D6)
    val WarningText = Color(0xFFA8791F)
    val Danger = Color(0xFFC0392B)
    val DangerSurface = Color(0xFFFBEBE8)
    val ChatGround = Color(0xFFF5F8FA)
    val TurnGround = Color(0xFFEAF4FA)
    val Waveform = Color(0xFF93A1AD)
}

val BrandBlue = Graspy.Brand
val Ink = Graspy.Text
val Correct = Graspy.SuccessDeep
val Retry = Graspy.Danger

val Poppins = FontFamily(
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
)

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
val Nunito = FontFamily(
    Font(R.font.nunito_variable, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.nunito_variable, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.nunito_variable, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
    Font(R.font.nunito_variable, FontWeight.ExtraBold, variationSettings = FontVariation.Settings(FontVariation.weight(800))),
    Font(R.font.nunito_variable, FontWeight.Black, variationSettings = FontVariation.Settings(FontVariation.weight(900))),
)

private val GraspyTypography = Typography(
    headlineLarge = TextStyle(fontFamily = Poppins, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontFamily = Poppins, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontFamily = Poppins, fontWeight = FontWeight.SemiBold, fontSize = 19.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontFamily = Poppins, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 21.sp),
    labelLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 14.sp),
    labelMedium = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, letterSpacing = 1.2.sp),
    labelSmall = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Bold, fontSize = 11.sp),
    // What a lesson asks a child to look at: the numbers themselves, heavy and rounded, readable from arm's length.
    displayLarge = TextStyle(fontFamily = Nunito, fontWeight = FontWeight.Black, fontSize = 64.sp, lineHeight = 72.sp, letterSpacing = (-1).sp),
)

@Composable
fun GraspyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Graspy.Action,
            onPrimary = Graspy.OnAction,
            background = Graspy.Background,
            onBackground = Graspy.Text,
            surface = Graspy.Surface,
            onSurface = Graspy.Text,
            error = Graspy.Danger,
        ),
        typography = GraspyTypography,
        content = content,
    )
}

@Composable
fun LanguageChoice(label: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        border = BorderStroke(1.dp, if (selected) Graspy.Brand else Graspy.Border),
    ) {
        Text(
            label,
            color = if (selected) Graspy.AccentText else Graspy.Text,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}
