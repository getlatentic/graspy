package com.latentic.graspy.ui

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDirection

/**
 * Maths reads left to right in every language, as the web renders it. Beside Arabic, the bidirectional
 * algorithm would otherwise turn "1 × 4 = ?" into "? = 4 × 1".
 */
fun TextStyle.leftToRight(): TextStyle = copy(textDirection = TextDirection.Ltr)

val LeftToRight = TextStyle(textDirection = TextDirection.Ltr)
