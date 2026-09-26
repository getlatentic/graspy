package com.latentic.graspy.learners

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.tapping

/** Signing in, choosing a learner and managing learners, in the frame onboarding uses. */
@Composable
fun AccountFrame(content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxSize(), color = Graspy.Background) {
        Column(
            Modifier
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
            content = content,
        )
    }
}

@Composable
fun AccountHeading(title: String, body: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, color = Graspy.Text, style = MaterialTheme.typography.headlineLarge)
        body?.let { Text(it, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyLarge) }
    }
}

@Composable
fun BackLink(text: String, onBack: () -> Unit) {
    Row(
        Modifier.clickable(onClick = tapping(onBack)).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null, tint = Graspy.AccentText, modifier = Modifier.size(18.dp))
        Text(text, color = Graspy.AccentText, style = MaterialTheme.typography.labelLarge)
    }
}
