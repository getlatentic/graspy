package com.latentic.graspy.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
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

@Composable
fun SignInScreen(copy: AccountCopy, state: SignInState, onSignIn: () -> Unit) {
    Surface(modifier = Modifier.fillMaxSize(), color = Graspy.Background) {
        Column(
            modifier = Modifier.statusBarsPadding().navigationBarsPadding().padding(horizontal = 28.dp, vertical = 48.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.Start,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(painterResource(R.drawable.ic_sprout), contentDescription = null, tint = Color.Unspecified, modifier = Modifier.size(30.dp))
                Text("graspy", color = Graspy.Brand, style = MaterialTheme.typography.headlineMedium)
            }
            Text(
                copy.signInTitle,
                color = Graspy.Text,
                style = MaterialTheme.typography.headlineLarge,
                modifier = Modifier.padding(top = 20.dp, bottom = 12.dp),
            )
            Text(
                copy.signInBody,
                color = Graspy.TextMuted,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.padding(bottom = 28.dp),
            )
            state.problem?.let {
                ProblemNote(
                    if (it == SignInProblem.NO_GOOGLE_ACCOUNT) copy.noGoogleAccount else copy.signInFailed,
                    Modifier.padding(bottom = 12.dp),
                )
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
            Text(
                copy.noPassword,
                color = Graspy.TextMuted,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }
}
