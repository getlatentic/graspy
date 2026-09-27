package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.EvaluatedSampleDto
import com.latentic.graspy.collection.SampleApi
import com.latentic.graspy.collection.VoiceRefusal
import java.io.File
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import retrofit2.HttpException

/** Where a sample's audio goes when the server named no path, as it does once the audio is ready; the web's fallback too. */
internal fun audioPath(sampleId: String) = "/api/voice/samples/$sampleId/audio"

internal suspend fun SampleApi.uploadWav(uploadPath: String, audio: File) {
    uploadAudio(uploadPath, audio.asRequestBody(WAV_MEDIA_TYPE))
}

/**
 * Has graspy mark the sample. Marked before its audio arrived, the audio goes once more and graspy is asked again, as
 * the web does; a second `audio_not_ready` is graspy's refusal and reaches the caller.
 */
internal suspend fun SampleApi.evaluation(sampleId: String, uploadPath: String, audio: File): EvaluatedSampleDto = try {
    evaluateSample(sampleId)
} catch (error: HttpException) {
    if (VoiceRefusal.of(error) != VoiceRefusal.AUDIO_NOT_READY) throw error
    uploadWav(uploadPath, audio)
    evaluateSample(sampleId)
}

private val WAV_MEDIA_TYPE = "audio/wav".toMediaType()
