package com.latentic.graspy.localization

/**
 * The words around a parent's agreement, in the web app's own words in every language (`consent` in
 * apps/web/src/locales). The notices themselves are English until they are translated (consent/ConsentNotices.kt).
 */
data class ConsentCopy(
    /** Asks a parent to agree for a learner already added; the learner's name is {name}. */
    val title: String,
    /** Says who agrees, under the notice. */
    val who: String,
    /** The button that signs the parent in with Google again and records their agreement. */
    val agree: String,
    val decline: String,
    /** Under a learner whose parent has not agreed. */
    val needed: String,
    /** When signing in again, or the agreement, did not go through: trying again signs in again. */
    val signIn: String,
    /** When the Google account chosen is not the one signed in to graspy. */
    val otherAccount: String,
)

/** A learner's voice recordings, kept only when a parent agrees, in the web's own words (`voiceRecordings`). */
data class RecordingsCopy(
    val title: String,
    /** The link to the screen, from a learner's row. */
    val link: String,
    val off: String,
    val keep: String,
    /** How long recordings are kept once a parent agreed; the days are {days}. */
    val keptFor: String,
    val keepFor: String,
    /** One of the days a parent may choose; the number is {days}. */
    val days: String,
    val empty: String,
    val play: String,
    val stop: String,
    val delete: String,
    val deleteAll: String,
    val deleteAllConfirm: String,
    val more: String,
    val stopTitle: String,
    val stopDelete: String,
    val stopKeep: String,
    val gone: String,
    val playFailed: String,
)

internal val ENGLISH_CONSENT = ConsentCopy(
    title = "Agree to graspy for {name}",
    who = "Agree as the learner, or their parent or guardian.",
    agree = "Agree with Google",
    decline = "Don't agree",
    needed = "Not agreed yet",
    signIn = "That sign-in didn't work. Try again.",
    otherAccount = "Use the Google account you are signed in with.",
)

internal val ENGLISH_RECORDINGS = RecordingsCopy(
    title = "Voice recordings",
    link = "Recordings",
    off = "graspy deletes each recording as soon as it has marked the answer.",
    keep = "Keep recordings",
    keptFor = "Kept for {days} days.",
    keepFor = "Keep for",
    days = "{days} days",
    empty = "No recordings yet.",
    play = "Play",
    stop = "Stop",
    delete = "Delete",
    deleteAll = "Delete all",
    deleteAllConfirm = "Delete all kept recordings? This can't be undone.",
    more = "Show more",
    stopTitle = "Stop keeping recordings?",
    stopDelete = "Stop and delete them",
    stopKeep = "Stop, keep them until they expire",
    gone = "That recording is gone.",
    playFailed = "That recording didn't play. Try again.",
)

internal val YORUBA_CONSENT = ConsentCopy(
    title = "Fọwọ́ sí graspy fún {name}",
    who = "Fọwọ́ sí gẹ́gẹ́ bí akẹ́kọ̀ọ́, tàbí òbí tàbí alágbàtọ́ rẹ̀.",
    agree = "Fọwọ́ sí pẹ̀lú Google",
    decline = "Kò fọwọ́ sí",
    needed = "A kò tíì fọwọ́ sí i",
    signIn = "Ìwọlé yẹn kò ṣiṣẹ́. Tún gbìyànjú.",
    otherAccount = "Lo àkọọ́lẹ̀ Google tí o fi wọlé.",
)

internal val YORUBA_RECORDINGS = RecordingsCopy(
    title = "Àwọn ohùn tí a gbà sílẹ̀",
    link = "Àwọn ohùn",
    off = "graspy ń pa gbogbo ohùn tí a gbà sílẹ̀ rẹ́ ní kété tí ó bá ti yẹ ìdáhùn wò.",
    keep = "Pa àwọn ohùn tí a gbà sílẹ̀ mọ́",
    keptFor = "A pa á mọ́ fún ọjọ́ {days}.",
    keepFor = "Pa á mọ́ fún",
    days = "ọjọ́ {days}",
    empty = "Kò sí ohùn tí a gbà sílẹ̀ síbẹ̀.",
    play = "Tẹ́tí sí i",
    stop = "Dúró",
    delete = "Pa á rẹ́",
    deleteAll = "Pa gbogbo rẹ̀ rẹ́",
    deleteAllConfirm = "Ṣé kí o pa gbogbo ohùn tí a pamọ́ rẹ́? A kò lè dá a padà.",
    more = "Fi púpọ̀ sí i hàn",
    stopTitle = "Ṣé kí a dẹ́kun pípa ohùn mọ́?",
    stopDelete = "Dẹ́kun kí o sì pa wọ́n rẹ́",
    stopKeep = "Dẹ́kun, pa wọ́n mọ́ títí wọn yóò fi parí",
    gone = "Ohùn yẹn ti lọ.",
    playFailed = "Ohùn yẹn kò ṣiṣẹ́. Tún gbìyànjú.",
)

internal val PIDGIN_CONSENT = ConsentCopy(
    title = "Agree to graspy for {name}",
    who = "Agree as the learner, or as im papa, mama or guardian.",
    agree = "Agree with Google",
    decline = "I no agree",
    needed = "Dem never agree yet",
    signIn = "That sign-in no work. Try again.",
    otherAccount = "Use the Google account wey you sign in with.",
)

internal val PIDGIN_RECORDINGS = RecordingsCopy(
    title = "Voice recordings",
    link = "Recordings",
    off = "graspy dey delete each recording as soon as e don mark the answer.",
    keep = "Keep recordings",
    keptFor = "Dem go keep am for {days} days.",
    keepFor = "Keep am for",
    days = "{days} days",
    empty = "No recording yet.",
    play = "Play",
    stop = "Stop",
    delete = "Delete",
    deleteAll = "Delete all",
    deleteAllConfirm = "Delete all the recordings wey dem keep? You no fit bring dem back.",
    more = "Show more",
    stopTitle = "Make graspy stop to keep recordings?",
    stopDelete = "Stop and delete dem",
    stopKeep = "Stop, but keep dem until dem expire",
    gone = "That recording don go.",
    playFailed = "That recording no play. Try again.",
)

internal val ARABIC_CONSENT = ConsentCopy(
    title = "الموافقة على graspy لـ {name}",
    who = "وافق بصفتك المتعلّم، أو والده أو وليّ أمره.",
    agree = "الموافقة عبر Google",
    decline = "لا أوافق",
    needed = "لم تتم الموافقة بعد",
    signIn = "لم ينجح تسجيل الدخول. حاول مرة أخرى.",
    otherAccount = "استخدم حساب Google الذي سجّلت الدخول به.",
)

internal val ARABIC_RECORDINGS = RecordingsCopy(
    title = "التسجيلات الصوتية",
    link = "التسجيلات",
    off = "يحذف graspy كل تسجيل بمجرد أن يصحّح الإجابة.",
    keep = "الاحتفاظ بالتسجيلات",
    keptFor = "يُحتفظ بها {days} يومًا.",
    keepFor = "الاحتفاظ لمدة",
    days = "{days} يومًا",
    empty = "لا توجد تسجيلات بعد.",
    play = "تشغيل",
    stop = "إيقاف",
    delete = "حذف",
    deleteAll = "حذف الكل",
    deleteAllConfirm = "حذف كل التسجيلات المحفوظة؟ لا يمكن التراجع عن ذلك.",
    more = "عرض المزيد",
    stopTitle = "إيقاف الاحتفاظ بالتسجيلات؟",
    stopDelete = "إيقاف وحذفها",
    stopKeep = "إيقاف وإبقاؤها حتى تنتهي مدتها",
    gone = "هذا التسجيل لم يعد موجودًا.",
    playFailed = "لم يُشغَّل هذا التسجيل. حاول مرة أخرى.",
)
