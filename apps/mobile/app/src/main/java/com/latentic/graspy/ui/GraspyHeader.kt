package com.latentic.graspy.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Icon
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import com.latentic.graspy.R

/** What the learner can do with their account, from You. */
data class AccountMenu(
    val onSwitchLearner: () -> Unit,
    val onManageLearners: () -> Unit,
    val onEditProfile: () -> Unit,
    val onSignOut: () -> Unit,
)

/** graspy's mark and name over every tab, as the web's top bar shows them on a phone. */
@Composable
fun GraspyHeader() {
    Column(Modifier.fillMaxWidth().background(GraspyColor.Surface).statusBarsPadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = space(4), vertical = space(3)),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(space(2)),
        ) {
            Icon(painterResource(R.drawable.ic_sprout), contentDescription = null, tint = Color.Unspecified, modifier = Modifier.size(space(7)))
            Image(painterResource(R.drawable.wordmark), contentDescription = "graspy", modifier = Modifier.height(space(5)))
        }
        HorizontalDivider(color = GraspyColor.Line)
    }
}
