package com.latentic.graspy.localization

/**
 * The app in Arabic, an interface language only: the teacher still speaks English, Yorùbá or Pidgin.
 * Text the web app also shows is the web's own Arabic. Numbers are written in digits, as the web writes
 * them, since the words the teacher says a table in are English.
 */
internal val ARABIC_COPY = AppCopy(
    topics = mapOf(
        "multiplication" to "جداول الضرب", "number" to "الأعداد والعدّ",
        "operations" to "الجمع والتقسيم", "time" to "قراءة الساعة",
        "money" to "النايرا والكوبو", "shapes" to "الأشكال", "fractions" to "الكسور",
        "alphabet" to "الحروف والأصوات",
    ),
    transcript = "سمع graspy",
    notUnderstoodFeedback = "لم أسمع عددًا. قل الإجابة مرة أخرى.",
    microphoneNeeded = "اسمح للميكروفون بتسجيل إجابتك.",
    recordingNotStarted = "لم يعمل الميكروفون. حاول مرة أخرى.",
    recordingNotSaved = "لم تُحفظ إجابتك. حاول مرة أخرى.",
    lesson = LessonCopy(
        teacherSpeaking = "المعلّمة تتكلّم",
        yourTurn = "دورك",
        sayItYourWay = "قلها بطريقتك.",
        speakNow = "تكلّم الآن…",
        recordTable = "سجّل إجابتك",
        stopAndSend = "انتهيت",
        sending = "جارٍ الإرسال…",
        analysing = "جارٍ التحقّق من إجابتك…",
        notUnderstoodFeedback = "لم أسمع جدول ضرب %1\$s. قله مرة أخرى ببطء.",
        playAgain = "استمع مرة أخرى",
        teacherAudioFailed = "لم يُحمَّل صوت المعلّمة.",
        waitingForTeacher = "نتحقّق مع معلّمتك…",
        noSpeech = "لم أسمعك. قلها مرة أخرى.",
        couldNotCheck = "لم أتمكّن من التحقّق. قلها مرة أخرى.",
        learnFact = "%1\$s في %2\$s يساوي %3\$s.",
        correctShort = "صحيح!",
        tryAgain = "محاولة جيدة. قلها مرة أخرى.",
        numbersInWords = false,
        loading = "جارٍ جلب درسك…",
        loadFailed = "لم يُحمَّل درسك.",
    ),
    home = HomeCopy(
        title = "دروسك",
        loading = "جارٍ جلب دروسك…",
        loadFailed = "لم تُحمَّل دروسك.",
        retry = "حاول مرة أخرى",
        noLessons = "لا توجد دروس لصفّك بعد.",
        mastered = "تعرفه",
        learnt = "تم تعلّمه",
        started = "بدأته",
        untouched = "ليس بعد",
        badges = "شاراتك",
        oneMoreDay = "يوم جيد آخر في %1\$s يربحك شارته.",
        almostThere = "اقتربت",
        startHere = "ابدأ من هنا",
    ),
)
