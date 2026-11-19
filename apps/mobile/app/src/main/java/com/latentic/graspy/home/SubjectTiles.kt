package com.latentic.graspy.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.latentic.graspy.plan.PlanSubject
import com.latentic.graspy.subjects.SubjectPicture
import com.latentic.graspy.subjects.subjectIcon
import com.latentic.graspy.subjects.subjectTint
import com.latentic.graspy.ui.AgeBand
import com.latentic.graspy.ui.EdgeToEdgeRow
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.LocalAgeBand
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

private val PICTURE_TILE_WIDTH = space(38)
private val ICON_TILE_WIDTH = space(46)

/** On a phone the next tile shows partly in view, so the row reads as scrollable. */
@Composable
fun SubjectTiles(subjects: List<PlanSubject>, onOpenSubject: (PlanSubject) -> Unit) {
    val band = LocalAgeBand.current
    EdgeToEdgeRow {
        items(subjects, key = { it.slug }) { subject ->
            SubjectTile(subject.name, band) { onOpenSubject(subject) }
        }
    }
}

/**
 * One tile, three builds, as the web's: a child sees a tall picture over the name, a tween a wider, shorter one,
 * and a teen or university learner a line icon beside it.
 */
@Composable
private fun SubjectTile(name: String, band: AgeBand, onOpen: () -> Unit) {
    val shape = RoundedCornerShape(GraspyRadius.Card)
    val tile = Modifier.clip(shape).background(GraspyColor.Surface).border(1.dp, GraspyColor.Line, shape).clickable(onClick = tapping(onOpen))
    if (band == AgeBand.Teen) {
        Row(tile.width(ICON_TILE_WIDTH).padding(space(3)), horizontalArrangement = Arrangement.spacedBy(space(3)), verticalAlignment = Alignment.CenterVertically) {
            val tint = subjectTint(name)
            Icon(
                rememberLucide(subjectIcon(name)),
                contentDescription = null,
                tint = tint.ink,
                modifier = Modifier.size(space(10)).clip(RoundedCornerShape(GraspyRadius.Control)).background(tint.ground).padding(space(2)),
            )
            TileName(name, Modifier.weight(1f))
        }
    } else {
        Column(tile.width(PICTURE_TILE_WIDTH)) {
            SubjectPicture(name, band, Modifier.fillMaxWidth().aspectRatio(if (band == AgeBand.Child) 4f / 3f else 16f / 9f))
            TileName(name, Modifier.padding(space(3)), lines = 2)
        }
    }
}

/** The name is held to two lines; a picture tile keeps both so the tiles in a row are as tall as each other. */
@Composable
private fun TileName(name: String, modifier: Modifier, lines: Int = 1) {
    Text(
        name,
        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
        color = GraspyColor.Ink,
        minLines = lines,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier,
    )
}
