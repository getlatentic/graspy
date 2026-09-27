package com.latentic.graspy.collection.outbox

import android.util.Log
import androidx.work.ListenableWorker.Result
import com.latentic.graspy.collection.ConsentDto
import com.latentic.graspy.collection.CreateSampleRequestDto
import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.collection.VoiceRefusal
import com.latentic.graspy.collection.isCompleteFor
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.resolveAppLanguage
import com.latentic.graspy.network.fromGraspy
import com.latentic.graspy.practice.fromSpoken
import com.latentic.graspy.sync.LessonRefreshRequest
import com.latentic.graspy.sync.LessonRefreshScheduler
import java.io.File
import java.io.IOException
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

/** What an answer still being marked keeps as its reason while it waits to be asked after again. */
internal const val STILL_BEING_CHECKED = "answer is still being checked"

/** The web never asks after an answer being marked sooner than this, whatever wait the server named. */
internal const val MIN_MARKING_WAIT_MILLIS = 3_000L

/** The wait before asking again after an answer still being marked; null when the server named none. */
internal fun markingWait(retryAfterMs: Long?): Long? =
    retryAfterMs?.takeIf { it > 0 }?.coerceAtLeast(MIN_MARKING_WAIT_MILLIS)

/**
 * One try at sending a recorded answer and having graspy mark it, for [SubmissionUploadWorker]. The answer is
 * kept until graspy has marked or refused it: every other outcome leaves it PENDING for another try.
 */
class SubmissionUpload(
    private val dao: SubmissionDao,
    private val learnerInUse: () -> String?,
    private val apiFor: (ownerId: String) -> SampleApi,
    private val profiles: LearnerProfileStore,
    private val retry: SubmissionRetry,
    private val lessons: LessonRefreshScheduler,
) {
    suspend fun send(localId: String): Result {
        val submission = dao.find(localId) ?: return Result.failure()
        val ownerId = submission.ownerId ?: return Result.failure()
        if (learnerInUse() != ownerId) return Result.success()
        if (submission.status == SubmissionStatus.COMPLETED.name) return Result.success()
        if (submission.status == SubmissionStatus.FAILED.name) return Result.failure()

        val audio = File(submission.audioPath)
        if (!audio.isFile) {
            dao.markFailed(localId, "recording file is missing")
            return Result.failure()
        }

        val learnerClass = profiles.learnerClass(ownerId)
        dao.markUploading(localId)
        return try {
            marked(submission, audio, learnerClass)
        } catch (error: HttpException) {
            val refusal = VoiceRefusal.of(error)
            if (refusal == VoiceRefusal.STEP_NOT_OFFERED) refreshLesson(ownerId, learnerClass)
            handleFailure(
                localId,
                failureCode(error) ?: "sample API returned HTTP ${error.code()}",
                UploadFailurePolicy.forHttp(error.code(), fromGraspy(error), refusal),
            )
        } catch (error: IOException) {
            if (learnerInUse() != ownerId) {
                dao.markPending(localId, "Waiting for the recording's learner")
                return Result.success()
            }
            handleFailure(localId, error.message ?: "sample API network failure", UploadFailurePolicy.forNetwork())
        } catch (error: SerializationException) {
            handleFailure(localId, "sample API answer could not be read", UploadFailurePolicy.forNetwork())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            dao.markFailed(localId, error.message ?: "sample submission failed")
            Result.failure()
        }
    }

    private suspend fun marked(submission: SubmissionEntity, audio: File, learnerClass: String?): Result {
        val localId = submission.localId
        val ownerId = requireNotNull(submission.ownerId)
        val api = apiFor(ownerId)
        val created = api.createSample(
            idempotencyKey = submission.idempotencyKey,
            request = sampleRequest(submission, learnerClass, learnerLanguage(ownerId)),
        )
        dao.markCreated(localId, created.sampleId, created.uploadPath)
        val uploadPath = created.uploadPath?.takeIf { it.isNotBlank() } ?: audioPath(created.sampleId)
        // Whether the audio landed is the evaluation's to say: `audio_not_ready` sends it once more.
        if (created.state != "ready") api.uploadWav(uploadPath, audio)
        val evaluated = api.evaluation(created.sampleId, uploadPath, audio)
        if (evaluated.state == "processing") {
            dao.markPending(localId, STILL_BEING_CHECKED)
            return askAgain(localId, evaluated.retryAfterMs)
        }
        if (!evaluated.isCompleteFor(submission.promptId)) {
            dao.markFailed(localId, "evaluation API returned an incomplete tutoring result")
            return Result.failure()
        }
        adoptDetectedLanguage(ownerId, evaluated.spokenLanguage)
        dao.markCompleted(
            localId = localId,
            serverSampleId = evaluated.sampleId,
            transcript = requireNotNull(evaluated.transcript),
            parsedAnswer = evaluated.parsedAnswer,
            decision = requireNotNull(evaluated.decision),
            feedback = requireNotNull(evaluated.feedback),
            provider = requireNotNull(evaluated.provider),
            latencyMs = requireNotNull(evaluated.latencyMs),
            resultJson = evaluated.result?.toJson(),
        )
        refreshLesson(ownerId, learnerClass)
        return Result.success()
    }

    /**
     * Still being marked: asked again when the server said, once the next try is stored, or after the usual backoff
     * when it named no wait or the next try could not be stored.
     */
    private suspend fun askAgain(localId: String, retryAfterMs: Long?): Result {
        val wait = markingWait(retryAfterMs) ?: return Result.retry()
        return if (queued(localId, wait)) Result.success() else Result.retry()
    }

    private suspend fun queued(localId: String, waitMillis: Long): Boolean = try {
        retry.after(localId, waitMillis)
        true
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        Log.w(TAG, "Storing the next try failed; the usual backoff asks again", error)
        false
    }

    private suspend fun handleFailure(localId: String, reason: String, disposition: UploadDisposition): Result =
        when (disposition) {
            UploadDisposition.RETRY -> {
                dao.markPending(localId, reason)
                Result.retry()
            }
            UploadDisposition.PERMANENT_FAILURE -> {
                dao.markFailed(localId, reason)
                Result.failure()
            }
            UploadDisposition.WAIT_FOR_LEARNER -> {
                dao.markPending(localId, "Waiting for the recording's learner")
                Result.success()
            }
        }

    /**
     * A marked answer changes what the teacher gives next, and a 409 says the step was never theirs.
     * Either way the phone needs the step the Worker would issue now.
     */
    private fun refreshLesson(ownerId: String, learnerClass: String?) {
        if (learnerClass == null) return
        lessons.refresh(LessonRefreshRequest(ownerId, learnerClass, learnerLanguage(ownerId)))
    }

    private fun learnerLanguage(ownerId: String): AppLanguage = resolveAppLanguage(
        profiles.load(ownerId)?.language ?: AppLanguageSelection.SYSTEM,
        Locale.getDefault().toLanguageTag(),
    )

    /** graspy answers in the language the learner used, once the Worker has heard it. */
    private fun adoptDetectedLanguage(ownerId: String, code: String?) {
        val profile = profiles.load(ownerId) ?: return
        if (profile.language != AppLanguageSelection.SYSTEM) return
        val detected = AppLanguageSelection.fromSpoken(code) ?: return
        profiles.save(ownerId, profile.copy(language = detected))
    }

    /** The Worker names permanent, learner-facing failures with a `code`, e.g. `no_speech`. */
    private fun failureCode(error: HttpException): String? {
        val body = runCatching { error.response()?.errorBody()?.string() }.getOrNull() ?: return null
        return Regex(""""code"\s*:\s*"([a-z_]+)"""").find(body)?.groupValues?.get(1)
    }

    private companion object {
        const val TAG = "GraspyUpload"
    }
}

/** What one recorded answer says about itself: the teacher marks it, and replies, in [lessonLanguage]. */
internal fun sampleRequest(submission: SubmissionEntity, learnerClass: String?, lessonLanguage: AppLanguage) = CreateSampleRequestDto(
    speakerId = submission.speakerId,
    languagePair = submission.languagePair,
    spokenLanguage = submission.spokenLanguage,
    lessonLanguage = lessonLanguage.code,
    learnerClass = learnerClass,
    task = submission.task,
    topic = submission.topic,
    promptId = submission.promptId,
    planId = submission.planId,
    eventId = submission.eventId,
    device = "android",
    noiseCondition = null,
    consent = ConsentDto(granted = true, scope = submission.consentScope),
)
