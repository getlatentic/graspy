package com.latentic.graspy.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.latentic.graspy.R

private val LOGO_HEIGHT = 40.dp
private val LIFT = 8.dp

/**
 * Onboarding and the account screens before learning, as the web frames them: the logo on the sky ground
 * and the screen's content on a card. The logo gives way while the keyboard is up. The content fills the card, so a screen that scrolls says so itself.
 */
@Composable
fun OnboardingFrame(content: @Composable ColumnScope.() -> Unit) {
    val card = RoundedCornerShape(GraspyRadius.Sheet)
    val keyboardUp = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    Column(Modifier.fillMaxSize().background(GraspyColor.ArtSky).windowInsetsPadding(WindowInsets.safeDrawing)) {
        // With the keyboard up the card needs the room more than the logo does.
        if (!keyboardUp) {
            Image(
                painterResource(R.drawable.logo_lockup),
                contentDescription = "graspy",
                modifier = Modifier.padding(horizontal = space(5), vertical = space(3)).height(LOGO_HEIGHT),
            )
        }
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(start = space(4), end = space(4), bottom = space(4))
                .shadow(LIFT, card, clip = false)
                .background(GraspyColor.Surface, card)
                .border(1.dp, GraspyColor.Line, card)
                .padding(space(5)),
            verticalArrangement = Arrangement.spacedBy(space(6)),
            content = content,
        )
    }
}
