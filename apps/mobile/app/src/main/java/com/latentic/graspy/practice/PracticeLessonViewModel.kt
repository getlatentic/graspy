package com.latentic.graspy.practice

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import com.latentic.graspy.account.PreferenceFiles
import com.latentic.graspy.collection.LessonEventDto
import com.latentic.graspy.collection.VoiceRefusal
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.SchoolClass
import com.latentic.graspy.sync.LessonMoveEntity
import com.latentic.graspy.sync.LessonRefreshRequest
import com.latentic.graspy.sync.RefreshState
import com.latentic.graspy.sync.lessonRefreshWorkName
import com.latentic.graspy.sync.move
import com.latentic.graspy.sync.moveOrigin
import com.latentic.graspy.sync.refreshState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.HttpException

/** A breath between her last word and the next step: long enough to land, short enough not to wait on. */
private const val TURN_PAUSE_MS = 1_500L

/** How long a step waits for its voice before appearing anyway: longer than a normal fetch, short of a stall. */
private const val SYNC_WAIT_MS = 4_000L

private data class Learner(
    val schoolClass: SchoolClass,
    val language: AppLanguage,
)

/** The classroom reads the step stored on the phone; WorkManager brings a newer one behind it. */
class PracticeLessonViewModel(application: Application, private val ownerId: String) : AndroidViewModel(application) {
    val teacherVoice = TeacherVoice(TeacherAudioRepository(application, AppGraph.sampleApiFor(application, ownerId)))
    private val mutableClassroom = MutableStateFlow(ClassroomState())
    val classroom = mutableClassroom.asStateFlow()
    private val mutableChatOpen = MutableStateFlow(false)
    val chatOpen = mutableChatOpen.asStateFlow()
    private val mutableThread = MutableStateFlow<List<LessonTurn>?>(null)
    val thread = mutableThread.asStateFlow()
    private val playback = application.getSharedPreferences(PreferenceFiles.PLAYBACK, 0)
    private val dao = AppGraph.database(application).submissionDao()
    private val cache = AppGraph.database(application).lessonCacheDao()
    private val scheduler = AppGraph.lessonRefreshScheduler(application)
    private val workManager = WorkManager.getInstance(application)
    private var observation: Job? = null
    private var actionJob: Job? = null
    private var heardSave: Job? = null
    private var learner: Learner? = null
    private var storedMove: LessonMoveEntity? = null
    private var refreshing = RefreshState.RUNNING
    private var refreshRequestedAtEpochMillis = Long.MAX_VALUE
    private var openedPlanId: String? = null
    private var lessonStarted = false
    private var visible = false
    private var continueRequested = false
    var recording: Boolean = false
    private var movingOn: Job? = null
    private var arriving: Job? = null
    private var arrivingState: ClassroomState? = null

    fun prepare(language: AppLanguage, schoolClass: SchoolClass) {
        val previous = learner
        learner = Learner(schoolClass, language)
        if (previous?.schoolClass == schoolClass) {
            render()
            return
        }
        mutableThread.value = null
        storedMove = null
        observation?.cancel()
        observation = viewModelScope.launch {
            launch {
                dao.observeLessonTurns(ownerId).collect { entities ->
                    mutableThread.value = entities.map { it.toLessonTurn() }
                    render()
                }
            }
            launch {
                cache.observeLessonMove(ownerId, schoolClass.wireValue).collect { stored ->
                    storedMove = stored
                    render()
                }
            }
            launch {
                workManager.getWorkInfosForUniqueWorkFlow(lessonRefreshWorkName(ownerId)).collect { work ->
                    refreshing = refreshState(work.map { it.state })
                    render()
                }
            }
        }
        refresh()
    }

    /** Ask WorkManager for a newer step. Repeated asks coalesce; nothing on screen waits for the answer. */
    fun refresh() {
        val learner = learner ?: return
        refreshRequestedAtEpochMillis = System.currentTimeMillis()
        scheduler.refresh(
            LessonRefreshRequest(ownerId, learner.schoolClass.wireValue, learner.language, openedPlanId),
        )
        render()
    }

    private fun render() {
        if (recording) return
        val turns = mutableThread.value ?: return
        val pending = pendingLessonTurn(turns)
        if (pending != null) {
            showPending(pending)
            return
        }
        val stored = storedMove
        if (stored == null) {
            showEmpty()
            return
        }
        val move = stored.move()
        val key = "${stored.ownerId}:${stored.learnerClass}:${stored.day}:${stored.revision}:${move.say}"
        val previous = mutableClassroom.value
        val step = move.firstStep()
        val next = ClassroomState(
            key = key,
            move = move,
            step = step,
            started = lessonStarted || continueRequested || playback.getBoolean("$key:started", false),
            audioHeard = playback.getBoolean("$key:${step.name}:heard", false),
            origin = moveOrigin(stored.fetchedAtEpochMillis, refreshRequestedAtEpochMillis),
            refreshFailed = refreshing == RefreshState.FAILED,
        )
        if (next == previous) return
        if (previous.key != key) {
            continueRequested = false
            teacherVoice.stop()
        }
        show(next)
    }

    /** Nothing stored yet: the learner is either waiting for their first sync or cannot reach it. */
    private fun showEmpty() {
        val step = if (refreshing == RefreshState.RUNNING) ClassroomStep.LOADING else ClassroomStep.LOAD_FAILED
        if (mutableClassroom.value.step == step) return
        teacherVoice.stop()
        arriving?.cancel()
        arrivingState = null
        mutableClassroom.value = ClassroomState(step = step)
    }

    /**
     * An answer the learner has not seen the result of yet, shown against the step it answered.
     *
     * The step comes from the cache when nothing is on screen to take it from. A learner who closes
     * the app mid-answer and opens it again arrives here with an empty screen behind them, and
     * without the cache that left them on a loading message their lesson could never leave.
     */
    private fun showPending(turn: LessonTurn) {
        val previous = mutableClassroom.value
        val step = if (turn.outcome != null || turn.unmarked) ClassroomStep.RESULT else ClassroomStep.SUBMITTING
        if (previous.key != turn.localId || previous.step != step) teacherVoice.stop()
        show(ClassroomState(
            key = turn.localId, move = previous.move ?: storedMove?.move(), step = step, started = true,
            audioHeard = turn.feedbackHeard, turn = turn,
        ))
    }

    private fun start() {
        lessonStarted = true
        val current = mutableClassroom.value
        mutableClassroom.value = current.copy(started = true)
        launchSaving { saveFlag("${current.key}:started") }
    }

    /** A step whose voice will not load is still a step: the words are on screen, so it may be answered. */
    fun teacherVoiceUnavailable() {
        val current = mutableClassroom.value
        if (current.audioHeard || !current.started) return
        mutableClassroom.value = current.copy(audioHeard = true)
        heardSave = launchSaving { saveFlag("${current.key}:${current.step.name}:heard") }
        // With no Continue button, moving on by itself is the only way past a step she could not say.
        considerMovingOn(current)
    }

    /**
     * Stop her mid-sentence. A child who has heard enough has heard the line, so the turn passes exactly
     * as if she had finished; left unheard, her going quiet would start the same line again.
     */
    fun hush() {
        val current = mutableClassroom.value
        teacherVoice.stop()
        // In the same call as stopping her, so her going quiet is never seen as a line still to be said.
        heard(current)
    }

    /**
     * A take nobody spoke in is dropped on the phone. She says so aloud, because a child who cannot read
     * would otherwise see only red words, and the turn comes back to the child when she finishes.
     */
    fun nothingHeard() {
        val learner = learner ?: return
        if (!mutableClassroom.value.allowsAnswer) return
        teacherVoice.play(listOf(TeacherUtterance.NO_SPEECH), learner.language)
    }

    /** A take can be dropped for silence, so her line for that is fetched while the child is still speaking. */
    fun recordingStarted() {
        val learner = learner ?: return
        teacherVoice.warm(TeacherUtterance.NO_SPEECH, learner.language)
    }

    /** Nothing new to fetch after a take: what arrived while the microphone was open is shown now. */
    fun recordingEnded() = render()

    fun play() {
        val learner = learner ?: return
        if (!mutableClassroom.value.canListen) return
        if (!mutableClassroom.value.started) start()
        val current = mutableClassroom.value
        val lines = current.audio()
        // Her reply is made for one turn: a result the server never named has no voice, only words.
        if (lines.isEmpty()) return heard(current)
        teacherVoice.play(lines, learner.language) { heard(current) }
    }

    private fun heard(current: ClassroomState) {
        // Heard the moment she stops, before it is saved: the voice going idle while the flag is still
        // being written is what made her say the same line twice.
        if (mutableClassroom.value.key == current.key && mutableClassroom.value.step == current.step) {
            mutableClassroom.value = mutableClassroom.value.copy(audioHeard = true)
        }
        // Saved on its own, never dropped behind another lesson action: a lost flag makes her repeat the
        // line the next time the lesson opens.
        heardSave = launchSaving {
            if (current.step == ClassroomStep.RESULT) {
                dao.markFeedbackHeard(requireNotNull(current.turn).localId)
            } else {
                saveFlag("${current.key}:${current.step.name}:heard")
            }
        }
        considerMovingOn(current)
    }

    fun continueLesson() {
        val current = mutableClassroom.value
        if (!current.allowsContinue) return
        runLessonAction {
            when (current.step) {
                ClassroomStep.LEARN -> markStepHeard(requireNotNull(current.move))
                ClassroomStep.RESULT -> {
                    continueRequested = true
                    dao.acknowledgeResult(requireNotNull(current.turn).localId)
                }
                else -> Unit
            }
        }
    }

    /**
     * A taught step becomes part of the teacher's memory. The Worker answers 409 when the step is not
     * the one it issued, which means the learner has already moved on: take the newer step instead.
     */
    private suspend fun markStepHeard(move: LessonMove) {
        val learner = requireNotNull(learner)
        try {
            AppGraph.sampleApiFor(getApplication(), ownerId)
                .lessonEventHeard(LessonEventDto(move.planId, move.eventId, learner.schoolClass.wireValue))
            continueRequested = true
        } catch (error: HttpException) {
            when (VoiceRefusal.of(error)) {
                VoiceRefusal.STEP_NOT_OFFERED -> Log.i(TAG, "The Worker has already moved this learner past ${move.eventId}")
                // The device is leaving this learner for "Who's learning?"; there is no step to take.
                VoiceRefusal.LEARNER_REQUIRED -> return
                else -> throw error
            }
        }
        refresh()
    }

    private suspend fun saveFlag(key: String) = withContext(Dispatchers.IO) {
        check(playback.edit().putBoolean(key, true).commit()) { "Lesson playback progress could not be saved" }
    }

    /** One lesson action at a time: a second tap while the first is still saving does nothing. */
    private fun runLessonAction(action: suspend () -> Unit) {
        if (actionJob?.isActive == true) return
        actionJob = launchSaving(action)
    }

    private fun launchSaving(action: suspend () -> Unit): Job = viewModelScope.launch {
        try {
            action()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.e(TAG, "Saving lesson progress failed", error)
            teacherVoice.stop()
            mutableClassroom.value = ClassroomState(step = ClassroomStep.LOAD_FAILED)
        }
    }

    /**
     * A step she has something to say for appears when her voice for it is ready, so the screen never runs
     * ahead of her. The wait is bounded: on a slow network the step appears and her voice follows.
     */
    private fun show(state: ClassroomState) {
        val learner = learner
        val speaksFirst = learner != null && visible && state.started && !state.audioHeard && state.canListen
        if (!speaksFirst) {
            arriving?.cancel()
            reveal(state)
            return
        }
        if (arrivingState == state) return
        arriving?.cancel()
        arrivingState = state
        val lines = state.audio()
        // What she says first is fetched first; the rest of what the step can say follows alongside.
        teacherVoice.preload((lines + state.move?.utterances().orEmpty()).distinct(), learner.language)
        val first = lines.firstOrNull() ?: return reveal(state)
        arriving = viewModelScope.launch {
            teacherVoice.ready(first, learner.language, SYNC_WAIT_MS)
            reveal(state)
        }
    }

    private fun reveal(state: ClassroomState) {
        arrivingState = null
        mutableClassroom.value = state
        speakIfUnheard()
        considerMovingOn(state)
    }

    /**
     * The turn passes on its own once she has finished a step that asks nothing of the child.
     *
     * A child who cannot read "Continue" should never be left looking at it. After a taught line or her
     * reply to an answer, the lesson moves on after a breath, provided the same step is still on screen,
     * she is silent, nothing is recording and the step may be left.
     */
    private fun considerMovingOn(heard: ClassroomState) {
        if (heard.step != ClassroomStep.LEARN && heard.step != ClassroomStep.RESULT) return
        movingOn?.cancel()
        movingOn = viewModelScope.launch {
            delay(TURN_PAUSE_MS)
            // A result is acknowledged only after its feedback is saved as heard, and moving on while
            // another lesson action runs would be dropped by it.
            heardSave?.join()
            actionJob?.join()
            val now = mutableClassroom.value
            val sameStep = now.key == heard.key && now.step == heard.step
            val silent = teacherVoice.state.value.let { it == TeacherVoiceState.READY || it == TeacherVoiceState.FAILED }
            if (visible && !recording && sameStep && silent && now.audioHeard && now.allowsContinue) continueLesson()
        }
    }

    /**
     * Say this step aloud if the learner has not heard it yet.
     *
     * Called both when a step arrives and when the voice finishes loading, because those happen in
     * either order. A line the teacher composes for this answer is synthesised while the screen is
     * already up, so waiting only for the step to arrive left the child looking at a dead button
     * with no way on but to press the speaker themselves.
     */
    fun speakIfUnheard() {
        val state = mutableClassroom.value
        val idle = teacherVoice.state.value == TeacherVoiceState.READY
        if (visible && state.started && !state.audioHeard && idle) play()
    }

    fun resume() {
        visible = true
        refresh()
    }

    fun pause() {
        visible = false
        teacherVoice.stop()
    }

    /** Opening a named lesson keeps asking for that one, so a refresh cannot swap it underneath. */
    fun openChat(planId: String? = null) {
        openedPlanId = planId
        // Choosing a lesson is the child's start: she speaks without a second tap on a screen with no button.
        lessonStarted = true
        mutableChatOpen.value = true
        if (planId != null) refresh() else render()
    }

    fun closeChat() {
        openedPlanId = null
        lessonStarted = false
        mutableChatOpen.value = false
        pause()
    }

    override fun onCleared() {
        teacherVoice.close()
        super.onCleared()
    }

    private companion object {
        const val TAG = "GraspyLesson"
    }
}
