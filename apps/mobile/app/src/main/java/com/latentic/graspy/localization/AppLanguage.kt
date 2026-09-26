package com.latentic.graspy.localization

import com.latentic.graspy.practice.numberWords
import java.util.Locale

/** The language the teacher speaks, and its code as the server reads it. */
enum class AppLanguage(val displayName: String, val code: String) {
    ENGLISH("English", "en"),
    YORUBA("Yorùbá", "yo"),
    PIDGIN("Pidgin", "pcm"),
}

enum class AppLanguageSelection(val storedValue: String) {
    SYSTEM("system"),
    ENGLISH("en"),
    YORUBA("yo"),
    PIDGIN("pcm"),
    ;

    companion object {
        fun fromStored(value: String?): AppLanguageSelection =
            entries.firstOrNull { it.storedValue == value } ?: SYSTEM
    }
}

fun resolveAppLanguage(selection: AppLanguageSelection, osLanguageTag: String): AppLanguage =
    when (selection) {
        AppLanguageSelection.ENGLISH -> AppLanguage.ENGLISH
        AppLanguageSelection.YORUBA -> AppLanguage.YORUBA
        AppLanguageSelection.PIDGIN -> AppLanguage.PIDGIN
        AppLanguageSelection.SYSTEM -> when (Locale.forLanguageTag(osLanguageTag).language) {
            "yo" -> AppLanguage.YORUBA
            "pcm" -> AppLanguage.PIDGIN
            else -> AppLanguage.ENGLISH
        }
    }

data class AppCopy(
    val topics: Map<String, String>,
    val transcript: String,
    val notUnderstoodFeedback: String,
    val microphoneNeeded: String,
    val recordingNotStarted: String,
    val recordingNotSaved: String,
    val lesson: LessonCopy,
    val home: HomeCopy,
)

/** The theme a lesson sits under, named as a learner would say it rather than as the file is filed. */
fun AppCopy.topicName(topic: String): String =
    topics[topic] ?: topic.replaceFirstChar(Char::uppercase)

/** Home: the lesson the teacher gives next, then the class's lessons and how far each one has come. */
data class HomeCopy(
    val title: String,
    val loading: String,
    val loadFailed: String,
    val retry: String,
    val noLessons: String,
    val mastered: String,
    val learnt: String,
    val started: String,
    val untouched: String,
    val badges: String,
    val oneMoreDay: String,
    val almostThere: String,
    val startHere: String,
)

data class LessonCopy(
    val teacherSpeaking: String,
    val yourTurn: String,
    val sayItYourWay: String,
    val speakNow: String,
    val recordTable: String,
    val stopAndSend: String,
    val sending: String,
    val analysing: String,
    val notUnderstoodFeedback: String,
    val playAgain: String,
    val teacherAudioFailed: String,
    val waitingForTeacher: String,
    val noSpeech: String,
    val couldNotCheck: String,
    val learnFact: String,
    val correctShort: String,
    val tryAgain: String,
    val loading: String,
    val loadFailed: String,
    /** Whether a table's numbers read as the words the teacher says them in, or as digits. */
    val numbersInWords: Boolean = true,
) {
    fun number(value: Int): String = if (numbersInWords) numberWords(value) else value.toString()

    /** Her stored words name the table the learner was reciting, in the words she says it in. */
    fun forTable(table: Int): LessonCopy = copy(notUnderstoodFeedback = notUnderstoodFeedback.replace("%1\$s", number(table)))
}

fun copyFor(language: InterfaceLanguage): AppCopy = when (language) {
    InterfaceLanguage.ENGLISH -> ENGLISH_COPY
    InterfaceLanguage.YORUBA -> YORUBA_COPY
    InterfaceLanguage.PIDGIN -> PIDGIN_COPY
    InterfaceLanguage.ARABIC -> ARABIC_COPY
}
