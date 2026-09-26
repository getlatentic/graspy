package com.latentic.graspy.ui.tabs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import com.latentic.graspy.localization.NavCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

/** How a tab looks, as the web draws it: the selected one in accent ink, its icon heavier inside a soft pill. */
data class TabLook(val ink: Color, val icon: Color, val pill: Color, val stroke: Float, val weight: FontWeight)

fun tabLook(selected: Boolean): TabLook = if (selected) {
    TabLook(GraspyColor.AccentInk, GraspyColor.AccentInk, GraspyColor.AccentSoft, 2.25f, FontWeight.SemiBold)
} else {
    TabLook(GraspyColor.Subtle, GraspyColor.Faint, GraspyColor.Surface, 1.5f, FontWeight.Normal)
}

/** The web's app tab bar: Home, Subjects, Ask and You, along the bottom. */
@Composable
fun TabBar(copy: NavCopy, selected: LearnTab, onSelect: (LearnTab) -> Unit) {
    Column(Modifier.fillMaxWidth().background(GraspyColor.Surface)) {
        HorizontalDivider(color = GraspyColor.Line)
        Row(
            Modifier.fillMaxWidth().semantics { contentDescription = copy.label }.selectableGroup(),
        ) {
            LearnTab.entries.forEach { tab ->
                TabItem(tab.label(copy), tab, tab == selected, Modifier.weight(1f)) { onSelect(tab) }
            }
        }
    }
}

@Composable
private fun TabItem(label: String, tab: LearnTab, selected: Boolean, modifier: Modifier, onSelect: () -> Unit) {
    val look = tabLook(selected)
    Column(
        modifier
            .selectable(selected = selected, role = Role.Tab, onClick = tapping(onSelect))
            .padding(top = space(2), bottom = space(1.5)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(space(1)),
    ) {
        Box(
            Modifier
                .height(space(8))
                .width(space(14))
                .background(look.pill, RoundedCornerShape(GraspyRadius.Pill)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                rememberLucide(tab.icon, look.stroke),
                contentDescription = null,
                tint = look.icon,
                modifier = Modifier.size(space(6)),
            )
        }
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = look.weight,
            color = look.ink,
            maxLines = 1,
        )
    }
}
