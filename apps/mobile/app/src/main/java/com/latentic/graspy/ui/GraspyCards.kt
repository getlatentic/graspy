package com.latentic.graspy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ui.icons.Lucide
import com.latentic.graspy.ui.icons.rememberLucide

private val CardShape = RoundedCornerShape(GraspyRadius.Card)

/** The web's Card: a white card with a hairline border. */
@Composable
fun GraspyCard(
    modifier: Modifier = Modifier,
    border: Color = GraspyColor.Line,
    contentPadding: Dp = space(5),
    gap: Dp = space(3),
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(GraspyColor.Surface)
            .border(1.dp, border, CardShape)
            .then(if (onClick != null) Modifier.clickable(onClick = tapping(onClick)) else Modifier)
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(gap),
        content = content,
    )
}

/** A screen's title, as the web's pages set theirs. */
@Composable
fun PageTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.headlineMedium,
        color = GraspyColor.Ink,
        modifier = modifier.semantics { heading() },
    )
}

/** The web's HomeSection: a heading and, beside it, a way to see more. */
@Composable
fun Section(title: String, more: Pair<String, () -> Unit>? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(space(3))) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                color = GraspyColor.Ink,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            more?.let { (label, onMore) -> MoreLink(label, onMore) }
        }
        content()
    }
}

@Composable
private fun MoreLink(label: String, onMore: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(GraspyRadius.Control)).clickable(onClick = tapping(onMore)).padding(space(1)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = GraspyColor.AccentInk)
        ForwardChevron(tint = GraspyColor.AccentInk)
    }
}

/** Points onward: to the right, or to the left in a right-to-left language. */
@Composable
fun ForwardChevron(modifier: Modifier = Modifier, tint: Color = GraspyColor.Muted) {
    val mirrored = LocalLayoutDirection.current == LayoutDirection.Rtl
    Icon(
        rememberLucide(Lucide.ChevronRight),
        contentDescription = null,
        tint = tint,
        modifier = modifier.size(space(4)).graphicsLayer { scaleX = if (mirrored) -1f else 1f },
    )
}

/** The web's ProgressBar: accent on the track, fully round. */
@Composable
fun ProgressBar(fraction: Float, modifier: Modifier = Modifier) {
    val pill = RoundedCornerShape(GraspyRadius.Pill)
    Box(modifier.fillMaxWidth().height(space(1.5)).clip(pill).background(GraspyColor.Track)) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(fraction.coerceIn(0f, 1f)).clip(pill).background(GraspyColor.Accent))
    }
}
