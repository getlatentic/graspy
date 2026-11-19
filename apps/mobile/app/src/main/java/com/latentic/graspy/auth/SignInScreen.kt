package com.latentic.graspy.auth

import android.content.res.Configuration
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
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

/**
 * The web's sign-in: the logo, the learner with a tablet, a question and one way in, on the sky ground.
 * A phone held across puts the words beside the picture, as the web does from its wide breakpoint.
 */
@Composable
fun SignInScreen(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit) {
    val wide = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    Box(Modifier.fillMaxSize().background(GraspyColor.ArtSky)) {
        Wave(Modifier.align(Alignment.BottomCenter))
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars).padding(horizontal = space(5), vertical = space(6))) {
            if (wide) Beside(copy, state, onSignIn) else Stacked(copy, state, onSignIn)
        }
    }
}

@Composable
private fun Stacked(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit) {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        Logo()
        Learner(Modifier.weight(1f).padding(vertical = space(4)))
        Words(copy, state, onSignIn, TextAlign.Center, Modifier.widthIn(max = CONTENT_WIDTH))
    }
}

@Composable
private fun Beside(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit) {
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(space(8)), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.SpaceBetween) {
            Logo()
            Words(copy, state, onSignIn, TextAlign.Start, Modifier.widthIn(max = CONTENT_WIDTH))
            Spacer(Modifier.height(LOGO_HEIGHT))
        }
        Learner(Modifier.weight(1f))
    }
}

@Composable
private fun Logo() {
    Image(painterResource(R.drawable.sign_in_logo), contentDescription = "graspy", modifier = Modifier.height(LOGO_HEIGHT))
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
private fun Words(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit, align: TextAlign, modifier: Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(space(3))) {
        Text(copy.ready, color = GraspyColor.OnArt, style = MaterialTheme.typography.headlineLarge, textAlign = align, modifier = Modifier.fillMaxWidth())
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
        drawPath(wave, GraspyColor.ArtWave, alpha = 0.6f)
    }
}
