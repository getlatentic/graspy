package com.latentic.graspy.recordings

import android.app.Activity
import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.latentic.graspy.auth.ParentConfirmation
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.consent.Agreement
import com.latentic.graspy.consent.DEFAULT_RETENTION_DAYS
import com.latentic.graspy.consent.agree
import com.latentic.graspy.consent.problem
import com.latentic.graspy.network.refusalCode
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A learner's voice recordings, for their parent: whether they are kept, the kept ones to play and delete, and the
 * switch that keeps them (after the parent signs in again) or stops.
 */
class RecordingsViewModel internal constructor(
    application: Application,
    private val keeping: VoiceKeeping,
    private val confirmation: ParentConfirmation,
    private val playback: RecordingPlayback,
) : AndroidViewModel(application) {
    constructor(application: Application) : this(
        application,
        AppGraph.voiceKeeping(application),
        AppGraph.account(application).parentConfirmation,
        MediaPlayerPlayback(),
    )

    private val mutableState = MutableStateFlow(RecordingsState())
    private var playingFile: File? = null

    /** The learner whose recordings these are, named by the screen that loads them. */
    private var learnerId = ""

    val state = mutableState.asStateFlow()

    /** Any recording a screen left in the cache goes first: it is a child's voice. */
    fun load(learnerId: String) {
        this.learnerId = learnerId
        finishPlaying()
        mutableState.update { it.copy(loadFailed = false) }
        viewModelScope.launch {
            withContext(Dispatchers.IO) { keeping.forgetFetched() }
            try {
                val page = keeping.overview(learnerId)
                mutableState.update { it.opened(page) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Listing the kept recordings failed", error)
                mutableState.update { it.copy(loadFailed = !it.loaded) }
            }
        }
    }

    fun more() {
        val before = mutableState.value.nextBefore ?: return
        act {
            val page = keeping.overview(learnerId, before)
            mutableState.update { it.withMore(page) }
        }
    }

    /** Off asks for the parent's agreement; on stops, asking first whether to delete what was kept, if any was. */
    fun switchTapped() {
        val current = mutableState.value
        when {
            current.busy -> Unit
            !current.keeping -> mutableState.update { it.copy(step = RecordingsStep.KEEPING, days = DEFAULT_RETENTION_DAYS, problem = null) }
            current.recordings.isEmpty() -> stop(deleteRecordings = false)
            else -> mutableState.update { it.copy(step = RecordingsStep.STOPPING, problem = null) }
        }
    }

    fun chooseDays(days: Int) = mutableState.update { it.copy(days = days) }

    fun askDeleteAll() = mutableState.update { it.copy(step = RecordingsStep.DELETING_ALL, problem = null) }

    /** Leaves what was asked, and the recordings as they were. */
    fun dismiss() = mutableState.update { it.copy(step = null, problem = null) }

    /**
     * The parent signs in with Google again over [activity], and the recordings are kept for the days chosen. A
     * parent who closes Google's sheet is left where they were; [activity] is used for this call only.
     */
    fun keep(activity: Activity) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, problem = null) }
        viewModelScope.launch {
            val days = mutableState.value.days
            val agreement = confirmation.agree(activity) { keeping.keep(learnerId, days, it) }
            if (agreement is Agreement.Failed) Log.w(TAG, "The parent's agreement was not recorded", agreement.error)
            mutableState.update {
                when (agreement) {
                    is Agreement.Recorded -> it.copy(busy = false, consent = agreement.value, step = null)
                    else -> it.copy(busy = false, problem = agreement.problem()?.forRecordings())
                }
            }
        }
    }

    fun stop(deleteRecordings: Boolean) = act(refreshAfterFailure = deleteRecordings) {
        keeping.stop(learnerId, deleteRecordings)
        if (deleteRecordings) finishPlaying()
        mutableState.update {
            val stopped = it.copy(consent = null, step = null)
            if (deleteRecordings) stopped.allDeleted() else stopped
        }
    }

    fun deleteAll() = act(refreshAfterFailure = true) {
        keeping.deleteAll(learnerId)
        finishPlaying()
        mutableState.update { it.allDeleted() }
    }

    fun delete(recordingId: String) = act {
        keeping.deleteOne(learnerId, recordingId)
        if (mutableState.value.playing == recordingId) finishPlaying()
        mutableState.update { it.without(recordingId) }
    }

    /** A recording playing stops; another is fetched to a file in the cache, played, and its file deleted. */
    fun play(recordingId: String) {
        val current = mutableState.value
        if (current.fetching != null) return
        val wasPlaying = current.playing == recordingId
        finishPlaying()
        if (wasPlaying) return
        mutableState.update { it.copy(fetching = recordingId, problem = null) }
        viewModelScope.launch { fetchAndPlay(recordingId) }
    }

    private suspend fun fetchAndPlay(recordingId: String) {
        try {
            val file = keeping.fetch(learnerId, recordingId)
            playingFile = file
            mutableState.update { it.copy(fetching = null, playing = recordingId) }
            playback.play(file) { finishPlaying() }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Playing a kept recording failed", error)
            val problem = if (refusalCode(error) == RECORDING_GONE) RecordingsProblem.GONE else RecordingsProblem.PLAY_FAILED
            mutableState.update {
                val listed = if (problem == RecordingsProblem.GONE) it.without(recordingId) else it
                listed.copy(fetching = null, problem = problem)
            }
        }
    }

    private fun finishPlaying() {
        playback.stop()
        playingFile?.delete()
        playingFile = null
        mutableState.update { it.copy(playing = null) }
    }

    /** One change at a time; a failure says so, and [refreshAfterFailure] lists what is left. */
    private fun act(refreshAfterFailure: Boolean = false, work: suspend () -> Unit) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, problem = null) }
        viewModelScope.launch {
            try {
                work()
                mutableState.update { it.copy(busy = false) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Changing the kept recordings failed", error)
                mutableState.update { it.copy(busy = false, problem = RecordingsProblem.FAILED) }
                if (refreshAfterFailure) refresh()
            }
        }
    }

    private suspend fun refresh() {
        try {
            val page = keeping.overview(learnerId)
            mutableState.update { it.opened(page) }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Log.w(TAG, "Listing the kept recordings after a failure failed", error)
        }
    }

    override fun onCleared() {
        finishPlaying()
        keeping.forgetFetched()
    }

    private companion object {
        const val TAG = "GraspyRecordings"
        const val RECORDING_GONE = "recording_gone"
    }
}
