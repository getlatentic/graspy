package com.latentic.graspy.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.fillWith
import com.latentic.graspy.ui.Graspy

/**
 * What a learner has collected, and what is closest to being collected next. A count out of the
 * whole class says nothing a young learner can act on; one lesson needing one more good day does.
 */
data class MasteryShelf(val badges: List<CatalogueLesson>, val nearest: CatalogueLesson?)

/** Mastery is the teacher's own measure — right on two different days — so it is what is collected. */
fun List<CatalogueLesson>.masteryShelf(): MasteryShelf {
    val (won, rest) = partition { it.standing == LessonStanding.MASTERED }
    return MasteryShelf(won, rest.filter { it.daysCorrect > 0 }.maxByOrNull { it.daysCorrect })
}

/**
 * The shelf of badges won, under the lessons rather than over them. A learner with none sees no
 * shelf and no heading for one: an empty case is not worth a title. What is close to being won is
 * worth saying either way, because it names one lesson and one more good day.
 */
@Composable
fun MasteryBadges(copy: AppCopy, shelf: MasteryShelf) {
    if (shelf.badges.isEmpty()) {
        shelf.nearest?.let { NextBadgeLine(copy, it) }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(copy.home.badges, color = Graspy.Text, style = MaterialTheme.typography.titleMedium)
            if (shelf.nearest != null) {
                Text(copy.home.almostThere, color = Graspy.SuccessDeep, style = MaterialTheme.typography.labelLarge)
            }
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            shelf.badges.forEach { MasteryBadge(it.title) }
        }
        shelf.nearest?.let { NextBadgeLine(copy, it) }
    }
}

@Composable
private fun NextBadgeLine(copy: AppCopy, nearest: CatalogueLesson) {
    Text(
        copy.home.oneMoreDay.fillWith(nearest.title),
        color = Graspy.TextMuted,
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
private fun MasteryBadge(title: String) {
    val shape = RoundedCornerShape(999.dp)
    Row(
        Modifier
            .background(Graspy.SuccessSurface, shape)
            .border(1.dp, Graspy.SuccessBorder, shape)
            .padding(start = 6.dp, top = 6.dp, end = 14.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(26.dp).background(Graspy.SuccessDeep, CircleShape), contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Check, contentDescription = null, tint = Graspy.OnAction, modifier = Modifier.size(17.dp))
        }
        Text(
            title,
            color = Graspy.SuccessText,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 220.dp),
        )
    }
}
