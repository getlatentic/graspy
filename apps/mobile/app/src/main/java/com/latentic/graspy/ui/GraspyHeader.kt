package com.latentic.graspy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.latentic.graspy.R
import com.latentic.graspy.account.ChosenLearner
import com.latentic.graspy.learners.initialOf
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.withName

/** What the account menu can do. */
data class AccountMenu(
    val onSwitchLearner: () -> Unit,
    val onManageLearners: () -> Unit,
    val onEditProfile: () -> Unit,
    val onSignOut: () -> Unit,
)

@Composable
fun GraspyHeader(copy: AppCopy, accountCopy: AccountCopy, learner: ChosenLearner, email: String?, menu: AccountMenu) {
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(painterResource(R.drawable.ic_sprout), contentDescription = null, tint = Color.Unspecified, modifier = Modifier.size(24.dp))
            Text(text = "graspy", style = MaterialTheme.typography.headlineSmall, color = Graspy.Brand)
        }
        Box {
            LearnerBadge(learner.name) { menuOpen = true }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                MenuHeading(accountCopy.learningAs.withName(learner.name), email)
                val closing = { action: () -> Unit -> { menuOpen = false; action() } }
                MenuItem(accountCopy.switchLearner, Graspy.Text, closing(menu.onSwitchLearner))
                MenuItem(accountCopy.manageLearners, Graspy.Text, closing(menu.onManageLearners))
                MenuItem(copy.onboarding.classAndLanguage, Graspy.Text, closing(menu.onEditProfile))
                MenuItem(accountCopy.signOut, Graspy.Danger, closing(menu.onSignOut))
            }
        }
    }
}

@Composable
private fun LearnerBadge(name: String, onOpen: () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .background(Graspy.AccentSurface, CircleShape)
            .border(1.dp, Graspy.AccentBorder, CircleShape)
            .clickable(onClick = tapping(onOpen)),
        contentAlignment = Alignment.Center,
    ) {
        Text(initialOf(name), style = MaterialTheme.typography.labelLarge, color = Graspy.AccentText)
    }
}

@Composable
private fun MenuItem(text: String, color: Color, onClick: () -> Unit) {
    DropdownMenuItem(text = { Text(text, color = color) }, onClick = tapping(onClick))
}

@Composable
private fun MenuHeading(learningAs: String, email: String?) {
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        Text(learningAs, color = Graspy.Text, style = MaterialTheme.typography.titleMedium)
        email?.let { Text(it, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyMedium) }
    }
}
