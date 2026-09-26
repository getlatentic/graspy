package com.latentic.graspy.collection

import android.Manifest
import android.app.Application
import android.util.Log
import androidx.annotation.RequiresPermission
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.account.PreferenceFiles
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.collection.outbox.NewSubmission
import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.collection.recording.NoAudibleSpeechException
import com.latentic.graspy.collection.recording.Pcm16WavRecorder
import com.latentic.graspy.collection.recording.SpeechEndpoint
import com.latentic.graspy.collection.recording.appendLevel
import com.latentic.graspy.practice.PracticeExercise
import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CollectionUiState(
    val languagePair: String = "yo-en",
    val spokenLanguage: String? = null,
    val isRecording: Boolean = false,
    val isSaving: Boolean = false,
    val queuedLocalId: String? = null,
    val problem: RecordingProblem? = null,
    val failureReason: String? = null,
)

/** Where a learner's recordings wait on the phone until graspy has them. */
const val RECORDINGS_DIRECTORY = "recordings"

/**
 * The consent a lesson recording carries. A learner is on the account only because whoever added them
 * confirmed they are that learner, or their parent or guardian; the learner then records an answer by
 * tapping to speak in their own lesson. The server accepts a recording only with consent granted.
 */
const val LESSON_CONSENT = "voice_lesson"

class CollectionViewModel(application: Application) : AndroidViewModel(application) {
    private val ownerId = requireNotNull(AppGraph.account(application).learnerInUse())
    private val recorder = Pcm16WavRecorder(viewModelScope)
    private val repository = AppGraph.submissionRepository(application)
    private val participantId = participantId(application)
    private val mutableState = MutableStateFlow(CollectionUiState())
    private var submissionObservation: Job? = null
    private var recordingTimeout: Job? = null

    val state = mutableState.asStateFlow()

    private val levels = MutableStateFlow<List<Float>>(emptyList())

    /** The current recording's loudness, a tenth of a second per entry; kept apart so it can change ten times a second. */
    val voiceLevels = levels.asStateFlow()

    private val dropped = MutableStateFlow(0)

    /**
     * Takes dropped on the phone because nobody spoke, counted so each one is answered once. A take the
     * server finds silent is not counted: it comes back as a result, which says so itself.
     */
    val droppedTakes = dropped.asStateFlow()

    fun selectLanguagePair(languagePair: String, spokenLanguage: String? = null) {
        require(languagePair == "yo-en" || languagePair == "pcm-en")
        require(spokenLanguage == null || spokenLanguage in SPOKEN_LANGUAGES)
        check(!mutableState.value.isRecording) { "language cannot change during recording" }
        mutableState.update {
            it.copy(languagePair = languagePair, spokenLanguage = spokenLanguage, problem = null)
        }
    }

    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    fun startRecording(exercise: PracticeExercise, planEvent: Pair<String, String>? = null) {
        this.planEvent = planEvent
        val current = mutableState.value
        check(!current.isRecording) { "a recording is already active" }
        val output = File(
            getApplication<Application>().filesDir,
            "$RECORDINGS_DIRECTORY/${UUID.randomUUID()}.wav",
        )
        try {
            levels.value = emptyList()
            val endpoint = SpeechEndpoint()
            recorder.start(output) { level ->
                levels.update { appendLevel(it, level) }
                endpointReached(endpoint.add(level), exercise)
            }
            recordingTimeout = viewModelScope.launch {
                kotlinx.coroutines.delay(110_000)
                if (mutableState.value.isRecording) stopAndQueue(exercise)
            }
            mutableState.update {
                it.copy(
                    isRecording = true,
                    queuedLocalId = null,
                    problem = null,
                    failureReason = null,
                )
            }
        } catch (error: RuntimeException) {
            Log.w(TAG, "The recording could not start", error)
            mutableState.update { it.copy(problem = RecordingProblem.NOT_STARTED) }
        }
    }

    private var planEvent: Pair<String, String>? = null

    /**
     * The take ends itself: a second of quiet after the child speaks sends it, and a take in which nobody
     * spoke is dropped on the phone, never uploaded. Called from the microphone's thread, so the ending
     * is handed to the main thread and happens once.
     */
    private fun endpointReached(state: SpeechEndpoint.State, exercise: PracticeExercise) {
        if (state != SpeechEndpoint.State.FINISHED && state != SpeechEndpoint.State.NOTHING_HEARD) return
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.Main) {
            if (!mutableState.value.isRecording) return@launch
            if (state == SpeechEndpoint.State.FINISHED) stopAndQueue(exercise) else dropSilentTake()
        }
    }

    private fun dropSilentTake() {
        recordingTimeout?.cancel()
        recorder.cancel()
        mutableState.update {
            it.copy(isRecording = false, failureReason = com.latentic.graspy.practice.NO_SPEECH)
        }
        dropped.update { it + 1 }
    }

    /** Ending a take that has already ended does nothing: a tap and the take ending itself can cross. */
    fun stopAndQueue(exercise: PracticeExercise) {
        if (!mutableState.value.isRecording) return
        recordingTimeout?.cancel()
        mutableState.update { it.copy(isRecording = false, isSaving = true, problem = null) }
        viewModelScope.launch {
            try {
                val recording = recorder.stop()
                val localId = repository.enqueue(
                    submission = NewSubmission(
                        ownerId = ownerId,
                        participantId = participantId,
                        speakerId = participantId,
                        languagePair = mutableState.value.languagePair,
                        spokenLanguage = mutableState.value.spokenLanguage,
                        task = exercise.task,
                        topic = exercise.topic,
                        promptId = exercise.promptId,
                        consentScope = LESSON_CONSENT,
                        planId = planEvent?.first,
                        eventId = planEvent?.second,
                    ),
                    recording = recording,
                )
                mutableState.update {
                    it.copy(
                        isSaving = false,
                        queuedLocalId = localId,
                    )
                }
                observeSubmission(localId)
            } catch (error: CancellationException) {
                throw error
            } catch (_: NoAudibleSpeechException) {
                mutableState.update {
                    it.copy(isSaving = false, failureReason = com.latentic.graspy.practice.NO_SPEECH)
                }
                dropped.update { it + 1 }
            } catch (error: Exception) {
                Log.w(TAG, "The recording could not be queued", error)
                mutableState.update { it.copy(isSaving = false, problem = RecordingProblem.NOT_SAVED) }
            }
        }
    }

    /** A rejected take belongs to the step it was made on; a new step starts without it. */
    fun clearFailure() {
        if (mutableState.value.isRecording) return
        mutableState.update { it.copy(failureReason = null) }
    }

    fun reportPermissionDenied() {
        mutableState.update { it.copy(problem = RecordingProblem.MICROPHONE_DENIED) }
    }

    private fun observeSubmission(localId: String) {
        submissionObservation?.cancel()
        submissionObservation = viewModelScope.launch {
            repository.observe(localId).filterNotNull().collect { submission ->
                val failed = submission.status == SubmissionStatus.FAILED.name
                mutableState.update { it.copy(failureReason = submission.failureReason?.takeIf { failed }) }
            }
        }
    }

    override fun onCleared() {
        recorder.cancel()
        super.onCleared()
    }

    private fun participantId(application: Application): String {
        val preferences = application.getSharedPreferences(PreferenceFiles.IDENTITY, 0)
        return preferences.getString(PARTICIPANT_ID, null) ?: UUID.randomUUID().toString().also {
            preferences.edit { putString(PARTICIPANT_ID, it) }
        }
    }

    private companion object {
        const val TAG = "GraspyRecording"
        const val PARTICIPANT_ID = "participant_id"
        val SPOKEN_LANGUAGES = setOf("en", "yo", "pcm")
    }
}
