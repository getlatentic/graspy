package com.latentic.graspy.recordings

import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** When a recording was made, in the phone's own way of writing a date and a time. */
internal fun recordedAtLabel(recordedAt: Long, locale: Locale, zone: TimeZone = TimeZone.getDefault()): String =
    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, locale)
        .apply { timeZone = zone }
        .format(Date(recordedAt))

/** How long a recording runs, as minutes and seconds. */
internal fun lengthLabel(seconds: Int): String = "%d:%02d".format(Locale.ROOT, seconds / SECONDS_IN_MINUTE, seconds % SECONDS_IN_MINUTE)

/** What a row says of a recording: its date, what it was for and how long it runs, where each is known. */
internal fun recordingLabel(recording: KeptRecordingDto, locale: Locale, zone: TimeZone = TimeZone.getDefault()): String =
    listOfNotNull(
        recordedAtLabel(recording.recordedAt, locale, zone),
        recording.lesson,
        recording.durationSeconds?.let(::lengthLabel),
    ).joinToString(" · ")

private const val SECONDS_IN_MINUTE = 60
