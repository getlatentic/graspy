package com.latentic.graspy.collection.outbox

import com.latentic.graspy.collection.SampleApi
import java.io.File
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody

/** Where a sample's audio goes when the server named no path, as it does once the audio is ready; the web's fallback too. */
internal fun audioPath(sampleId: String) = "/api/voice/samples/$sampleId/audio"

internal suspend fun SampleApi.uploadWav(uploadPath: String, audio: File) {
    uploadAudio(uploadPath, audio.asRequestBody(WAV_MEDIA_TYPE))
}

private val WAV_MEDIA_TYPE = "audio/wav".toMediaType()
