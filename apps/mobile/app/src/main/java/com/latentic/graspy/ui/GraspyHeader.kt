package com.latentic.graspy.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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

/** graspy's mark and name, over every tab. */
@Composable
fun GraspyHeader() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = space(4), vertical = space(2.5)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(space(2)),
    ) {
        Icon(painterResource(R.drawable.ic_sprout), contentDescription = null, tint = Color.Unspecified, modifier = Modifier.size(space(6)))
        Text(text = "graspy", style = MaterialTheme.typography.headlineSmall, color = GraspyColor.Accent)
    }
}
