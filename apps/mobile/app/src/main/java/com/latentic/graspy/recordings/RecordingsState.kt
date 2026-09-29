package com.latentic.graspy.recordings

import com.latentic.graspy.consent.ConsentProblem
import com.latentic.graspy.consent.DEFAULT_RETENTION_DAYS

/** What did not go through, as the parent is told it: to try again, or that the recording is gone. */
enum class RecordingsProblem { OTHER_ACCOUNT, SIGN_IN, FAILED, GONE, PLAY_FAILED }

internal fun ConsentProblem.forRecordings() = when (this) {
    ConsentProblem.OTHER_ACCOUNT -> RecordingsProblem.OTHER_ACCOUNT
    ConsentProblem.SIGN_IN -> RecordingsProblem.SIGN_IN
    ConsentProblem.FAILED -> RecordingsProblem.FAILED
}

/** The agreement's own problems, for the notice that asks for it. */
internal fun RecordingsProblem?.forNotice() = when (this) {
    RecordingsProblem.OTHER_ACCOUNT -> ConsentProblem.OTHER_ACCOUNT
    RecordingsProblem.SIGN_IN -> ConsentProblem.SIGN_IN
    RecordingsProblem.FAILED -> ConsentProblem.FAILED
    else -> null
}

/** What the parent is being asked, over the list: to agree to keeping recordings, to stop, or to delete them all. */
enum class RecordingsStep { KEEPING, STOPPING, DELETING_ALL }

data class RecordingsState(
    /** False until the first page arrives. */
    val loaded: Boolean = false,
    val loadFailed: Boolean = false,
    /** Null while recordings are not kept: each is deleted as soon as it is marked. */
    val consent: VoiceConsentDto? = null,
    val recordings: List<KeptRecordingDto> = emptyList(),
    val nextBefore: Long? = null,
    val step: RecordingsStep? = null,
    /** The days chosen while [step] is [RecordingsStep.KEEPING]. */
    val days: Int = DEFAULT_RETENTION_DAYS,
    val busy: Boolean = false,
    val problem: RecordingsProblem? = null,
    /** The recording being fetched to play. */
    val fetching: String? = null,
    val playing: String? = null,
) {
    val keeping: Boolean get() = consent != null
}

internal fun RecordingsState.opened(page: VoiceOverviewDto) = copy(
    loaded = true,
    loadFailed = false,
    consent = page.consent,
    recordings = page.recordings,
    nextBefore = page.nextBefore,
)

internal fun RecordingsState.withMore(page: VoiceOverviewDto) =
    copy(recordings = recordings + page.recordings, nextBefore = page.nextBefore)

internal fun RecordingsState.without(id: String) = copy(recordings = recordings.filterNot { it.id == id })

internal fun RecordingsState.allDeleted() = copy(recordings = emptyList(), nextBefore = null, step = null)
