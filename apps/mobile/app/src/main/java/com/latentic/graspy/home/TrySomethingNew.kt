package com.latentic.graspy.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.latentic.graspy.ask.AskOpening
import com.latentic.graspy.ask.ChatTarget
import com.latentic.graspy.localization.PlanHomeCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.CurrentTopic
import com.latentic.graspy.ui.EdgeToEdgeRow
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.icons.Lucide
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space
import com.latentic.graspy.ui.tapping

/** The web's ideas for what to ask (features/learn/lib/ask-ideas.ts), with its icons, tints and words. */
enum class AskIdea(val icon: Lucide, val tint: Color, val title: (PlanHomeCopy) -> String, val detail: (PlanHomeCopy) -> String) {
    EXPLAIN(Lucide.MessageCircle, GraspyColor.Accent, PlanHomeCopy::askTitle, PlanHomeCopy::askDetail),
    PRACTISE(Lucide.Pencil, GraspyColor.TintGreen, PlanHomeCopy::practiseTitle, PlanHomeCopy::practiseDetail),
    PLAN(Lucide.CalendarDays, GraspyColor.TintPurple, PlanHomeCopy::planTitle, PlanHomeCopy::planDetail),
    ;

    /** Practice goes to the topic Home continues, other ideas to the general chat; nothing is sent for the learner. */
    fun opening(home: PlanHomeCopy, current: CurrentTopic?): AskOpening = when (this) {
        EXPLAIN -> AskOpening(ChatTarget.General, null)
        PRACTISE -> current?.let { AskOpening(ChatTarget.Topic(it.subject.slug, it.index), home.practiseDraft.filled("topic" to it.topic)) }
            ?: AskOpening(ChatTarget.General, home.practiseDraftAny)
        PLAN -> AskOpening(ChatTarget.General, home.planDraft)
    }
}

/** On a phone they scroll: three side by side would need text too small to read. */
@Composable
fun TrySomethingNew(home: PlanHomeCopy, onPick: (AskIdea) -> Unit) {
    EdgeToEdgeRow {
        items(AskIdea.entries) { idea ->
            val shape = RoundedCornerShape(GraspyRadius.Card)
            Row(
                Modifier
                    .width(space(52))
                    .clip(shape)
                    .background(GraspyColor.Surface)
                    .border(1.dp, GraspyColor.Line, shape)
                    .clickable(onClick = tapping { onPick(idea) })
                    .padding(horizontal = space(4), vertical = space(3.5)),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(space(3)),
            ) {
                Icon(rememberLucide(idea.icon), contentDescription = null, tint = idea.tint, modifier = Modifier.size(space(6)))
                Column {
                    Text(idea.title(home), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = GraspyColor.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(idea.detail(home), style = MaterialTheme.typography.bodySmall, color = GraspyColor.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
