package com.latentic.graspy.ui

import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Dp

/** A row that scrolls out under the page's side padding and snaps each item to it, as the web's `-mx-4 px-4 snap-x` rows do. */
@Composable
fun EdgeToEdgeRow(pagePadding: Dp = space(4), gap: Dp = space(2), content: LazyListScope.() -> Unit) {
    val state = rememberLazyListState()
    LazyRow(
        modifier = Modifier.bleed(pagePadding),
        state = state,
        contentPadding = PaddingValues(start = pagePadding, end = pagePadding, bottom = space(1)),
        horizontalArrangement = Arrangement.spacedBy(gap),
        flingBehavior = rememberSnapFlingBehavior(state, SnapPosition.Start),
        content = content,
    )
}

private fun Modifier.bleed(by: Dp) = layout { measurable, constraints ->
    val extra = if (constraints.hasBoundedWidth) by.roundToPx() * 2 else 0
    val placeable = measurable.measure(constraints.copy(minWidth = constraints.minWidth + extra, maxWidth = constraints.maxWidth + extra))
    layout(placeable.width - extra, placeable.height) { placeable.place(-extra / 2, 0) }
}
