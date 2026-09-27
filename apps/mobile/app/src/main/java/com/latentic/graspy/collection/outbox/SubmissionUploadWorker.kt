package com.latentic.graspy.collection.outbox

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.latentic.graspy.collection.ConsentDto
import com.latentic.graspy.collection.VoiceRefusal
import com.latentic.graspy.collection.CreateSampleRequestDto
import com.latentic.graspy.collection.isCompleteFor
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.resolveAppLanguage
import com.latentic.graspy.network.fromGraspy
import com.latentic.graspy.practice.fromSpoken
import com.latentic.graspy.sync.LessonRefreshRequest
import java.io.File
import java.io.IOException
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

class SubmissionUploadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    private val profiles = AppGraph.account(appContext).profiles

    override suspend fun doWork(): Result {
        val localId = inputData.getString(LOCAL_ID) ?: return Result.failure()
        val dao = AppGraph.database(applicationContext).submissionDao()
        val submission = dao.find(localId) ?: return Result.failure()
        val ownerId = submission.ownerId ?: return Result.failure()
        if (AppGraph.account(applicationContext).learnerInUse() != ownerId) return Result.success()
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
            val api = AppGraph.sampleApiFor(applicationContext, ownerId)
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
                dao.markPending(localId, "answer is still being checked")
                return askAgain(localId, evaluated.retryAfterMs)
            }
            val transcript = evaluated.transcript
            val decision = evaluated.decision
            val feedback = evaluated.feedback
            val provider = evaluated.provider
            val latencyMs = evaluated.latencyMs
            if (!evaluated.isCompleteFor(submission.promptId)) {
                dao.markFailed(localId, "evaluation API returned an incomplete tutoring result")
                return Result.failure()
            }
            adoptDetectedLanguage(ownerId, evaluated.spokenLanguage)
            dao.markCompleted(
                localId = localId,
                serverSampleId = evaluated.sampleId,
                transcript = requireNotNull(transcript),
                parsedAnswer = evaluated.parsedAnswer,
                decision = requireNotNull(decision),
                feedback = requireNotNull(feedback),
                provider = requireNotNull(provider),
                latencyMs = requireNotNull(latencyMs),
                resultJson = evaluated.result?.toJson(),
            )
            refreshLesson(ownerId, learnerClass)
            Result.success()
        } catch (error: HttpException) {
            val refusal = VoiceRefusal.of(error)
            if (refusal == VoiceRefusal.STEP_NOT_OFFERED) refreshLesson(ownerId, learnerClass)
            handleFailure(
                localId,
                failureCode(error) ?: "sample API returned HTTP ${error.code()}",
                UploadFailurePolicy.forHttp(error.code(), fromGraspy(error), refusal),
                dao,
            )
        } catch (error: IOException) {
            if (AppGraph.account(applicationContext).learnerInUse() != ownerId) {
                dao.markPending(localId, "Waiting for the recording's learner")
                return Result.success()
            }
            handleFailure(
                localId,
                error.message ?: "sample API network failure",
                UploadFailurePolicy.forNetwork(),
                dao,
            )
        } catch (error: SerializationException) {
            handleFailure(localId, "sample API answer could not be read", UploadFailurePolicy.forNetwork(), dao)
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            dao.markFailed(localId, error.message ?: "sample submission failed")
            Result.failure()
        }
    }

    /** Still being marked: asked again when the server said, or after the usual backoff when it named no wait. */
    private fun askAgain(localId: String, waitMillis: Long?): Result {
        if (waitMillis == null || waitMillis <= 0) return Result.retry()
        AppGraph.submissionRetry(applicationContext).after(localId, waitMillis)
        return Result.success()
    }

    private suspend fun handleFailure(
        localId: String,
        reason: String,
        disposition: UploadDisposition,
        dao: SubmissionDao,
    ): Result = when (disposition) {
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
        AppGraph.lessonRefreshScheduler(applicationContext)
            .refresh(LessonRefreshRequest(ownerId, learnerClass, learnerLanguage(ownerId)))
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

    companion object {
        const val LOCAL_ID = "local_id"
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
