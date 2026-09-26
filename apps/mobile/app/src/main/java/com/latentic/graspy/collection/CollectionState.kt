package com.latentic.graspy.collection

@JvmInline
value class Consent(val scope: String)

@JvmInline
value class CompletedRecording(val path: String)

data class CollectionState(
    val consent: Consent? = null,
    val recording: CompletedRecording? = null,
) {
    val canUpload: Boolean = consent != null && recording != null
}

