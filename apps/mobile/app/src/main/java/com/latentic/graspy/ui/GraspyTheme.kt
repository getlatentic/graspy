package com.latentic.graspy.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em

private fun TextStyle.set(family: FontFamily, weight: FontWeight) = copy(fontFamily = family, fontWeight = weight)

fun graspyTypography() = Typography(
    headlineLarge = GraspyText.Xl3.set(DisplayFont, FontWeight.SemiBold),
    headlineMedium = GraspyText.Xl2.set(DisplayFont, FontWeight.SemiBold),
    headlineSmall = GraspyText.Xl.set(DisplayFont, FontWeight.SemiBold),
    titleMedium = GraspyText.Base.set(DisplayFont, FontWeight.SemiBold),
    titleSmall = GraspyText.Base.set(SansFont, FontWeight.SemiBold),
    bodyLarge = GraspyText.Base.set(SansFont, FontWeight.Normal),
    bodyMedium = GraspyText.Sm.set(SansFont, FontWeight.Normal),
    bodySmall = GraspyText.Xs.set(SansFont, FontWeight.Normal),
    labelLarge = GraspyText.Sm.set(SansFont, FontWeight.SemiBold),
    // The web's section label: small capitals spaced wide.
    labelMedium = GraspyText.Xs.set(SansFont, FontWeight.SemiBold).copy(letterSpacing = 0.1.em),
    labelSmall = GraspyText.Xs.set(SansFont, FontWeight.Medium),
    displayLarge = GraspyText.Numeral.set(SansFont, FontWeight.ExtraBold),
)

@Composable
fun GraspyTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = GraspyColor.Accent,
            onPrimary = GraspyColor.OnAccent,
            background = GraspyColor.Canvas,
            onBackground = GraspyColor.Ink,
            surface = GraspyColor.Surface,
            onSurface = GraspyColor.Ink,
            onSurfaceVariant = GraspyColor.Muted,
            outline = GraspyColor.Line,
            outlineVariant = GraspyColor.Line,
            error = GraspyColor.Danger,
        ),
        typography = graspyTypography(),
        content = content,
    )
}
