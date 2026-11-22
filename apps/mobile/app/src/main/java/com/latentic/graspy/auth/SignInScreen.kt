package com.latentic.graspy.auth

import android.content.res.Configuration
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.latentic.graspy.R
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.space

private val LOGO_HEIGHT = 48.dp
private val WAVE_HEIGHT = 96.dp
private val CONTENT_WIDTH = 384.dp

/** The share of the window's height the picture takes on a phone held upright. */
private const val LEARNER_SHARE = 0.38f

/**
 * The web's sign-in: the logo, the learner with a tablet, a question and one way in, on the sky ground.
 * A phone held across puts the words beside the picture, as the web does from its wide breakpoint.
 */
@Composable
fun SignInScreen(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit) {
    val wide = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    Box(Modifier.fillMaxSize().background(GraspyColor.ArtGroundMid)) {
        Wave(Modifier.align(Alignment.BottomCenter))
        BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = space(5), vertical = space(6))) {
            if (wide) Beside(copy, state, onSignIn, maxHeight) else Stacked(copy, state, onSignIn, maxHeight)
        }
    }
}

/** The words scroll when the window is short or the text large, so the way in is never out of reach. */
@Composable
private fun Stacked(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit, height: Dp) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).heightIn(min = height),
        verticalArrangement = Arrangement.SpaceBetween,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Logo()
        Learner(Modifier.height(height * LEARNER_SHARE).padding(vertical = space(4)))
        Words(copy, state, onSignIn, TextAlign.Center, Alignment.CenterHorizontally, Modifier.widthIn(max = CONTENT_WIDTH))
    }
}

@Composable
private fun Beside(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit, height: Dp) {
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(space(8)), verticalAlignment = Alignment.CenterVertically) {
        Column(
            Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()).heightIn(min = height),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Logo()
            Words(copy, state, onSignIn, TextAlign.Start, Alignment.Start, Modifier.widthIn(max = CONTENT_WIDTH).padding(vertical = space(4)))
        }
        Learner(Modifier.weight(1f).fillMaxHeight())
    }
}

@Composable
private fun Logo() {
    Image(painterResource(R.drawable.logo_lockup), contentDescription = "graspy", modifier = Modifier.height(LOGO_HEIGHT))
}

@Composable
private fun Learner(modifier: Modifier) {
    Image(
        painterResource(R.drawable.sign_in_learner),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        alignment = Alignment.BottomCenter,
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun Words(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit, align: TextAlign, across: Alignment.Horizontal, modifier: Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(space(3)), horizontalAlignment = across) {
        Text(copy.ready, color = GraspyColor.OnArt, style = MaterialTheme.typography.headlineLarge, textAlign = align, modifier = Modifier.fillMaxWidth().semantics { heading() })
        Text(copy.signInPrompt, color = GraspyColor.OnArt, style = MaterialTheme.typography.bodyLarge, textAlign = align, modifier = Modifier.fillMaxWidth())
        if (state.failed) ProblemNote(copy.signInFailed)
        PrimaryButton(if (state.busy) copy.signingIn else copy.signIn, onSignIn, Modifier.fillMaxWidth(), enabled = !state.busy)
    }
}

/** A soft wave along the foot, behind everything, the web's own shape. */
@Composable
private fun Wave(modifier: Modifier) {
    Canvas(modifier.fillMaxWidth().height(WAVE_HEIGHT)) {
        val unitX = size.width / 1440f
        val unitY = size.height / 200f
        val wave = Path().apply {
            moveTo(0f, 120f * unitY)
            cubicTo(240f * unitX, 40f * unitY, 480f * unitX, 40f * unitY, 720f * unitX, 100f * unitY)
            cubicTo(960f * unitX, 160f * unitY, 1200f * unitX, 180f * unitY, 1440f * unitX, 80f * unitY)
            lineTo(size.width, size.height)
            lineTo(0f, size.height)
            close()
        }
        drawPath(wave, GraspyColor.ArtGroundEnd, alpha = 0.6f)
    }
}
