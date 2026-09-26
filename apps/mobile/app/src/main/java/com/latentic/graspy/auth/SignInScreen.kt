package com.latentic.graspy.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.latentic.graspy.R
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.space

/**
 * The sprout at the size and place the splash screen draws it, so signing in continues the splash: the
 * platform draws the 240dp splash icon at 288dp, so the 132dp sprout inside it shows at 158dp.
 */
private val SPLASH_MARK = 158.dp

/** How far below the window's centre the wordmark sits: under the sprout, with a little air. */
private val WORDMARK_OFFSET = 118.dp

@Composable
fun SignInScreen(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit) {
    Surface(modifier = Modifier.fillMaxSize(), color = GraspyColor.Canvas) {
        Box(Modifier.fillMaxSize()) {
            Icon(
                painterResource(R.drawable.ic_sprout),
                contentDescription = null,
                tint = Color.Unspecified,
                modifier = Modifier.size(SPLASH_MARK).align(Alignment.Center),
            )
            Text(
                "graspy",
                color = GraspyColor.Accent,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.align(Alignment.Center).offset(y = WORDMARK_OFFSET),
            )
            Column(
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal = space(7), vertical = space(8)),
                verticalArrangement = Arrangement.spacedBy(space(3)),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                state.problem?.let {
                    ProblemNote(if (it == SignInProblem.NO_GOOGLE_ACCOUNT) copy.noGoogleAccount else copy.signInFailed)
                }
                PrimaryButton(
                    if (state.busy) copy.signingIn else copy.signIn,
                    onSignIn,
                    Modifier.fillMaxWidth(),
                    enabled = !state.busy,
                )
            }
        }
    }
}
