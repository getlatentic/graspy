package com.latentic.graspy.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.latentic.graspy.R
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.tapping

/**
 * The sprout at the size and place the splash screen draws it, so signing in continues the splash: the
 * platform draws the 240dp splash icon at 288dp, so the 132dp sprout inside it shows at 158dp.
 */
private val SPLASH_MARK = 158.dp

/** How far below the window's centre the wordmark sits: under the sprout, with a little air. */
private val WORDMARK_OFFSET = 118.dp

@Composable
fun SignInScreen(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit) {
    Surface(modifier = Modifier.fillMaxSize(), color = Graspy.Background) {
        Box(Modifier.fillMaxSize()) {
            Icon(
                painterResource(R.drawable.ic_sprout),
                contentDescription = null,
                tint = Color.Unspecified,
                modifier = Modifier.size(SPLASH_MARK).align(Alignment.Center),
            )
            Text(
                "graspy",
                color = Graspy.Brand,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.align(Alignment.Center).offset(y = WORDMARK_OFFSET),
            )
            Column(
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal = 28.dp, vertical = 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                state.problem?.let {
                    ProblemNote(if (it == SignInProblem.NO_GOOGLE_ACCOUNT) copy.noGoogleAccount else copy.signInFailed)
                }
                Button(
                    onClick = tapping(onSignIn),
                    enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    shape = RoundedCornerShape(26.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Graspy.Action, contentColor = Graspy.OnAction),
                ) {
                    Text(if (state.busy) copy.signingIn else copy.signIn, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }
}
