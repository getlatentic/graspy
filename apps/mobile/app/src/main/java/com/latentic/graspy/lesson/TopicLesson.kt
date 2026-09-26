package com.latentic.graspy.lesson

import android.util.Log
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.latentic.graspy.learners.BackLink
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.mcp.AppView
import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.ViewServer
import com.latentic.graspy.mcp.ViewEvents
import com.latentic.graspy.plan.LessonTarget
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.SecondaryButton
import com.latentic.graspy.ui.space
import kotlinx.coroutines.CancellationException

private const val FINISH_LESSON = "finish_lesson"
private const val TAG = "GraspyLesson"

/** What opening a lesson came to. */
private sealed interface Opened {
    data object Waiting : Opened
    data object Failed : Opened
    data class Shown(val card: ViewCard) : Opened
}

/**
 * A topic's lesson: give_lesson's view, as the web opens it from a subject. The view follows its own
 * making and marks the topic learnt when the learner finishes; then the plan is read again. A lesson
 * once whole opens from the phone's copy while the server cannot be reached.
 */
@Composable
fun TopicLesson(
    learn: LearnCopy,
    locale: String,
    server: ViewServer,
    lessons: OfflineLessons,
    target: LessonTarget,
    onBack: () -> Unit,
    onLearnt: () -> Unit,
    /** Shows the lesson's view: its card, what its calls go to, and what its events mean. */
    showView: @Composable (ViewCard, ViewServer, ViewEvents) -> Unit = { card, calls, events ->
        AppView(card = card, server = calls, locale = locale, unavailable = learn.chat.viewUnavailable, events = events)
    },
) {
    // Goes up only when the learner retries after a failure.
    var attempt by rememberSaveable(target) { mutableIntStateOf(0) }
    val opened by produceState<Opened>(Opened.Waiting, target, attempt) {
        value = Opened.Waiting
        value = try {
            Opened.Shown(lessons.openOrCopy(target, attempt))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            Log.w(TAG, "The lesson on ${target.topic} did not open", error)
            Opened.Failed
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(space(4))) {
        BackLink(learn.lesson.backTo.filled("subject" to target.subject), onBack)
        when (val shown = opened) {
            Opened.Waiting -> Text(learn.lesson.loading, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
            Opened.Failed -> {
                Text(learn.lesson.loadFailed, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyLarge)
                SecondaryButton(learn.lesson.tryAgain, { attempt += 1 })
            }
            is Opened.Shown -> showView(
                shown.card,
                remember(shown.card) { LessonViewServer(server, lessons, target, shown.card) },
                ViewEvents(toolCalled = { name, _, _ -> if (name == FINISH_LESSON) onLearnt() }),
            )
        }
    }
}
