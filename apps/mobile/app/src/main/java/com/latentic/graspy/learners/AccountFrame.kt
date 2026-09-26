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
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyHeader
import com.latentic.graspy.ui.tapping
import com.latentic.graspy.ui.space

/** Choosing a learner and managing learners, under the header onboarding and the rest of the app have. */
@Composable
fun AccountFrame(content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxSize(), color = GraspyColor.Canvas) {
        Column {
            GraspyHeader()
            Column(
                Modifier
                    .navigationBarsPadding()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = space(6), vertical = space(8)),
                verticalArrangement = Arrangement.spacedBy(space(6)),
                content = content,
            )
        }
    }
}

@Composable
fun AccountHeading(title: String) {
    Text(title, color = GraspyColor.Ink, style = MaterialTheme.typography.headlineLarge)
}

@Composable
fun BackLink(text: String, onBack: () -> Unit) {
    Row(
        Modifier.clickable(onClick = tapping(onBack)).padding(vertical = space(1)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(1.5)),
    ) {
        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null, tint = GraspyColor.AccentInk, modifier = Modifier.size(18.dp))
        Text(text, color = GraspyColor.AccentInk, style = MaterialTheme.typography.labelLarge)
    }
}
