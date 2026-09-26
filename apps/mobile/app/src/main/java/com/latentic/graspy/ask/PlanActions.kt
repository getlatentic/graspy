package com.latentic.graspy.ask

import com.latentic.graspy.localization.ChatCopy
import com.latentic.graspy.localization.filled
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.LearningPath
import com.latentic.graspy.plan.namesAfter
import com.latentic.graspy.plan.withPath
import com.latentic.graspy.plan.withTopic
import kotlinx.coroutines.CancellationException

/** What the tutor may change in the learner's plan, as the plan's owner carries it out. */
interface PlanChanges {
    val plan: LearnerPlan?

    suspend fun apply(next: LearnerPlan): LearnerPlan

    suspend fun changeSubjects(names: List<String>)

    suspend fun planPath(goal: String): LearningPath

    /** False when there is nothing to rebuild. */
    fun rebuild(): Boolean
}

/** A change that clears progress or adds a subject waits for the learner: the model saying they agreed is not agreement. */
sealed interface PendingChange {
    data class ChangeSubjects(val names: List<String>, val removed: List<String>) : PendingChange

    data object Rebuild : PendingChange

    /** [path] is null while it is being planned. */
    data class Path(val goal: String, val path: LearningPath?, val failed: Boolean = false) : PendingChange
}

/** How the chat reports a change: in the app's own words, with a link to where it shows. */
interface ActionReports {
    suspend fun done(text: String, link: ChatLink?)

    suspend fun failed(text: String)

    fun pending(change: PendingChange?)

    fun changing(busy: Boolean)

    /** A rebuild replaces the plan; Home shows it being made. */
    fun rebuilt()
}

/**
 * The tutor's actions carried out as the web carries them (features/learn/hooks/use-tutor-actions.ts): opening a
 * topic or subject is a note with a link, adding a topic is done at once, and anything that drops a subject,
 * rebuilds the plan or adds a path first asks the learner.
 */
class PlanActions(private val plan: PlanChanges, private val words: ChatCopy, private val reports: ActionReports, private val clock: () -> Long = System::currentTimeMillis) {
    suspend fun carryOut(action: TutorAction) {
        when (action) {
            is TutorAction.OpenTopic -> reports.done(words.topicReady.filled("topic" to action.topic), lessonLink(action.subjectSlug, action.topicIndex))
            is TutorAction.OpenSubject -> reports.done(
                words.subjectReady.filled("subject" to action.subject),
                ChatLink(words.openSubject, LinkTarget.Subject(action.subjectSlug)),
            )
            is TutorAction.AddTopic -> addTopic(action)
            is TutorAction.ChangeSubjects -> askToChange(action)
            TutorAction.RebuildPlan -> reports.pending(PendingChange.Rebuild)
            is TutorAction.ProposePath -> propose(action.goal)
        }
    }

    suspend fun confirm(change: PendingChange) {
        when (change) {
            is PendingChange.ChangeSubjects -> setSubjects(change.names)
            PendingChange.Rebuild -> if (plan.rebuild()) reports.rebuilt()
            is PendingChange.Path -> change.path?.let { acceptPath(it) }
        }
    }

    private suspend fun addTopic(action: TutorAction.AddTopic) {
        val current = plan.plan ?: return
        val (next, index) = current.withTopic(action.subjectSlug, action.topic, clock()) ?: return
        if (next !== current) plan.apply(next)
        reports.done(words.topicAdded.filled("topic" to action.topic, "subject" to action.subject), lessonLink(action.subjectSlug, index))
    }

    private suspend fun askToChange(action: TutorAction.ChangeSubjects) {
        val current = plan.plan ?: return
        val names = namesAfter(current.subjects, action.add, action.remove)
        val removed = current.subjects.map { it.name }.filterNot { it in names }
        if (removed.isEmpty()) setSubjects(names) else reports.pending(PendingChange.ChangeSubjects(names, removed))
    }

    private suspend fun setSubjects(names: List<String>) {
        reports.changing(true)
        try {
            plan.changeSubjects(names)
            reports.done(words.subjectsChanged, ChatLink(words.seeSubjects, LinkTarget.Subjects))
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            reports.failed(words.planChangeFailed)
        } finally {
            reports.changing(false)
        }
    }

    private suspend fun propose(goal: String) {
        plan.plan ?: return
        reports.pending(PendingChange.Path(goal, null))
        val planned = try {
            plan.planPath(goal)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            null
        }
        reports.pending(PendingChange.Path(goal, planned, failed = planned == null))
    }

    private suspend fun acceptPath(path: LearningPath) {
        val current = plan.plan ?: return
        val (next, subject) = current.withPath(path, clock())
        val kept = plan.apply(next)
        reports.done(words.pathAdded.filled("subject" to subject.name), lessonLink(subject.slug, maxOf(0, kept.goalIndex(subject.slug))))
    }

    private fun lessonLink(subjectSlug: String, index: Int) = ChatLink(words.openLesson, LinkTarget.Lesson(subjectSlug, index))
}
