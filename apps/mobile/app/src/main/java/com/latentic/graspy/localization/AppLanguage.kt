package com.latentic.graspy.localization

import com.latentic.graspy.practice.numberWords
import java.util.Locale

enum class AppLanguage(val displayName: String) {
    ENGLISH("English"),
    YORUBA("Yorùbá"),
    PIDGIN("Pidgin"),
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
    /** What each curriculum subject is called, keyed by the subject folder in the plans. */
    val subjects: Map<String, String>,
    val topics: Map<String, String>,
    val tagline: String,
    val introduction: String,
    val appLanguage: String,
    val phoneLanguage: String,
    val startPractice: String,
    val startLesson: String,
    val listen: String,
    val preparingTeacher: String,
    val practiceDetail: String,
    val practise: String,
    val contribute: String,
    val recordEvaluation: String,
    val contributionDetail: String,
    val record: String,
    val back: String,
    val prompt: String,
    val practiceDisclosure: String,
    val contributionDisclosure: String,
    val allowRecording: String,
    val consentRecorded: String,
    val languagePair: String,
    val yorubaEnglish: String,
    val pidginEnglish: String,
    val recordAnswer: String,
    val stopAndCheck: String,
    val saving: String,
    val transcript: String,
    val queued: String,
    val retained: String,
    val uploaded: String,
    val feedbackQuestion: String,
    val correctFeedback: String,
    val wrongAnswerTemplate: String,
    val notUnderstoodFeedback: String,
    val contributeTitle: String,
    val question: String,
    val yes: String,
    val no: String,
    val thanksForChecking: String,
    val microphoneNeeded: String,
    val recordingNotStarted: String,
    val recordingNotSaved: String,
    val lesson: LessonCopy,
    val home: HomeCopy,
    val onboarding: OnboardingCopy,
)

/** A curriculum subject as the learner reads it; a subject with no name still reads as one. */
fun AppCopy.subjectName(subject: String): String =
    subjects[subject] ?: subject.replaceFirstChar(Char::uppercase)

/** The theme a lesson sits under, named as a learner would say it rather than as the file is filed. */
fun AppCopy.topicName(topic: String): String =
    topics[topic] ?: topic.replaceFirstChar(Char::uppercase)

/** Home: the lesson the teacher gives next, then the class's lessons and how far each one has come. */
data class HomeCopy(
    val tab: String,
    val title: String,
    val nextLesson: String,
    val loading: String,
    val refreshing: String,
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
    val yourTeacher: String,
)

data class OnboardingCopy(
    val whatClass: String,
    val whichLanguage: String,
    /** Said where the lesson language is chosen: the teacher speaks only these, whatever the app's words. */
    val lessonLanguageNote: String,
    val whichInterface: String,
    val interfaceNote: String,
    val followPhone: String,
    val next: String,
    val classAndLanguage: String,
    val detectLanguage: String,
    /** Each class as a school names it, keyed by its wire value. */
    val classLabels: Map<String, String>,
) {
    fun classLabel(schoolClass: SchoolClass): String = classLabels.getValue(schoolClass.wireValue)
}

data class LessonCopy(
    val steps: List<String>,
    val teacherPromptNext: String,
    val eyebrow: String,
    val title: String,
    val detail: String,
    val teacherPrompt: String,
    val teacherReady: String,
    val teacherSpeaking: String,
    val yourTurn: String,
    val sayItYourWay: String,
    val speakNow: String,
    val recordTable: String,
    val stopAndSend: String,
    val yourVoiceNote: String,
    val listening: String,
    val sending: String,
    val sent: String,
    val analysing: String,
    val feedbackReady: String,
    val factsCorrectTemplate: String,
    val missingFacts: String,
    val uncertainFacts: String,
    val wrongFacts: String,
    val heardTemplate: String,
    val completeFeedback: String,
    val retryFeedback: String,
    val notUnderstoodFeedback: String,
    val playAgain: String,
    val teacherAudioFailed: String,
    val retryTeacherAudio: String,
    val waitingForTeacher: String,
    val keptOnPhone: String,
    val showWords: String,
    val showMaths: String,
    val threadSubtitle: String,
    val today: String,
    val resultEyebrow: String,
    val sendFailed: String,
    val noSpeech: String,
    val couldNotCheck: String,
    val noWords: String,
    val learnFact: String,
    val askFact: String,
    val retryFacts: String,
    val correctShort: String,
    val doneToday: String,
    val masteredTable: String,
    val finished: String,
    val youSaid: String,
    val tryAgain: String,
    val factResultEyebrow: String,
    val chats: String,
    val openChat: String,
    /** Whether a table's numbers read as the words the teacher says them in, or as digits. */
    val numbersInWords: Boolean = true,
) {
    fun number(value: Int): String = if (numbersInWords) numberWords(value) else value.toString()

    /** Resolve every table template for one lesson; the number word stays English in all modes. */
    fun forTable(table: Int): LessonCopy {
        val word = number(table)
        fun String.filled() = replace("%1\$s", word)
        return copy(
            title = title.filled(),
            detail = detail.filled(),
            teacherPrompt = (if (table == 1) teacherPrompt else teacherPromptNext).filled(),
            threadSubtitle = threadSubtitle.filled(),
            doneToday = doneToday.filled(),
            masteredTable = masteredTable.filled(),
            completeFeedback = completeFeedback.filled(),
            retryFeedback = retryFeedback.filled(),
            notUnderstoodFeedback = notUnderstoodFeedback.filled(),
        )
    }
}

fun copyFor(language: InterfaceLanguage): AppCopy = when (language) {
    InterfaceLanguage.ENGLISH -> ENGLISH_COPY
    InterfaceLanguage.YORUBA -> YORUBA_COPY
    InterfaceLanguage.PIDGIN -> PIDGIN_COPY
    InterfaceLanguage.ARABIC -> ARABIC_COPY
}
