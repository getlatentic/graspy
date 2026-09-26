package com.latentic.graspy.practice

import android.content.Context
import android.media.MediaPlayer
import android.util.Log
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.localization.AppLanguage
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class TeacherVoiceState { INITIALIZING, READY, BUFFERING, SPEAKING, FAILED }

/**
 * Something the teacher says out loud.
 *
 * A lesson line is published and reviewed before any child opens the app, and can be rewritten, so
 * the phone checks its copy once a session. Her reply to one answer is written in the moment and
 * belongs to that turn alone, so once it is on the phone it never changes.
 */
sealed interface TeacherLine {
    /** The name its clip is kept under on the phone. */
    val fileName: String

    /** Whether the words behind this clip can change after the phone has it. */
    val rewritable: Boolean

    /** How long to wait for the clip before going on without it. */
    val longestWait: Long
}

/** A published, reviewed teacher utterance, addressed by the Worker's utterance ID. */
@JvmInline
value class TeacherUtterance(val wireValue: String) : TeacherLine {
    override val fileName: String get() = wireValue
    override val rewritable: Boolean get() = true

    // A lesson line is worth waiting for on a poor connection: without it the step has no voice at all.
    override val longestWait: Long get() = 45_000L

    companion object {
        val PROMPT = TeacherUtterance("prompt")
        val CORRECT = TeacherUtterance("feedback-correct")
        val RETRY = TeacherUtterance("feedback-retry")
        val UNCLEAR = TeacherUtterance("feedback-unclear")
        val NO_SPEECH = TeacherUtterance("no-speech")
        val TRY_AGAIN = TeacherUtterance("try-again")
        val CORRECT_SHORT = TeacherUtterance("correct")
        val RETRY_FACTS = TeacherUtterance("retry-facts")
        val FINISHED = TeacherUtterance("finished")
        fun factLearn(table: Int, multiplier: Int) = TeacherUtterance("fact-$table-$multiplier-learn")
        fun factAsk(table: Int, multiplier: Int) = TeacherUtterance("fact-$table-$multiplier-ask")
        fun tablePrompt(table: Int) = TeacherUtterance("table-$table-prompt")
        fun tableCorrect(table: Int) = TeacherUtterance("table-$table-feedback-correct")
        fun tableRetry(table: Int) = TeacherUtterance("table-$table-feedback-retry")
        val TABLE_1_PROMPT = tablePrompt(1)
        val TABLE_1_CORRECT = tableCorrect(1)
        val TABLE_1_RETRY = tableRetry(1)
    }
}

/** What the teacher said about one marked answer, in her own words for that child's try. */
data class TeacherReply(val sampleId: String) : TeacherLine {
    override val fileName: String get() = "reply-$sampleId"
    override val rewritable: Boolean get() = false

    // A child is sitting in front of the marked answer, reading it: she does not wait long to hear it.
    override val longestWait: Long get() = 10_000L
}

/** Every line a move says before the child answers; her reply is spoken only once it exists. */
fun LessonMove.utterances(): List<TeacherUtterance> =
    (promptUtterances + exercise?.promptUtterances.orEmpty() + TeacherUtterance.NO_SPEECH).distinct()

class TeacherVoice(
    context: Context,
    private val repository: TeacherAudioRepository = TeacherAudioRepository(
        context.applicationContext, AppGraph.sampleApi(context.applicationContext),
    ),
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutableState = MutableStateFlow(TeacherVoiceState.INITIALIZING)
    private val mutablePlaying = MutableStateFlow<TeacherLine?>(null)
    private var player: MediaPlayer? = null
    private var audioJob: kotlinx.coroutines.Job? = null
    val state = mutableState.asStateFlow()
    val playing = mutablePlaying.asStateFlow()

    /** Fetch every line a step can say, so each plays the moment it is needed. Nothing she says stops. */
    fun preload(lines: List<TeacherLine>, language: AppLanguage) = lines.forEach { warm(it, language) }

    /**
     * Waits until this line is on the phone, for at most [waitMillis]; true when it is. A line that cannot
     * be fetched now is not an error here: playing it later reports that.
     */
    suspend fun ready(line: TeacherLine, language: AppLanguage, waitMillis: Long): Boolean =
        kotlinx.coroutines.withTimeoutOrNull(waitMillis) {
            try {
                repository.prepare(line, language.spokenLanguage())
                true
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (error: Exception) {
                false
            }
        } ?: false

    /** Fetch a line she may be about to need, so it plays the moment it is asked for. Nothing she says stops. */
    fun warm(line: TeacherLine, language: AppLanguage) {
        scope.launch {
            try {
                repository.prepare(line, language.spokenLanguage())
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Fetching ${line.fileName} early failed; it is fetched again when played", error)
            }
        }
    }

    fun play(line: TeacherLine, language: AppLanguage) = play(listOf(line), language)

    /**
     * Says these lines in order. [onFinished] runs when she stops, whether she said them or could not:
     * a child waiting to move on must never be held there by a line that failed to arrive.
     */
    fun play(lines: List<TeacherLine>, language: AppLanguage, onFinished: () -> Unit = {}) {
        require(lines.isNotEmpty())
        stop()
        audioJob = scope.launch {
            try {
                for (line in lines) {
                    mutableState.value = TeacherVoiceState.BUFFERING
                    mutablePlaying.value = line
                    val audio = repository.prepare(line, language.spokenLanguage())
                    playFile(audio, line)
                }
                mutablePlaying.value = null
                mutableState.value = TeacherVoiceState.READY
            } catch (error: kotlinx.coroutines.CancellationException) {
                throw error
            } catch (error: Exception) {
                fail(error)
            }
            onFinished()
        }
    }

    private suspend fun playFile(audio: File, line: TeacherLine) =
        kotlinx.coroutines.suspendCancellableCoroutine<Unit> { continuation ->
            val current = MediaPlayer()
            player = current
            continuation.invokeOnCancellation { current.release() }
            current.setOnPreparedListener {
                mutableState.value = TeacherVoiceState.SPEAKING
                current.start()
                Log.i(TAG, "Teacher line started ${line.fileName}")
            }
            current.setOnCompletionListener {
                Log.i(TAG, "Teacher line completed ${line.fileName}")
                current.release()
                player = null
                continuation.resumeWith(Result.success(Unit))
            }
            current.setOnErrorListener { _, what, extra ->
                current.release()
                player = null
                continuation.resumeWith(Result.failure(IllegalStateException("Teacher playback failed ($what/$extra)")))
                true
            }
            current.setDataSource(audio.absolutePath)
            current.prepareAsync()
        }

    fun stop() {
        audioJob?.cancel()
        audioJob = null
        player = null
        mutablePlaying.value = null
        mutableState.value = TeacherVoiceState.READY
    }

    private fun fail(error: Exception) {
        player?.release()
        player = null
        mutablePlaying.value = null
        mutableState.value = TeacherVoiceState.FAILED
        Log.e(TAG, "Hosted teacher voice failed", error)
    }

    fun close() {
        stop()
        scope.cancel()
    }

    private companion object {
        const val TAG = "GraspyTeacherVoice"
    }
}
