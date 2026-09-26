package com.latentic.graspy.practice

import com.latentic.graspy.localization.AppLanguage

data class ClassroomCopy(
    val stages: List<String>,
    val continueLabel: String,
    val retry: String,
    val loading: String,
    val loadFailed: String,
    val sayTogether: String,
    val listenAndAnswer: String,
) {
    fun title(step: ClassroomStep): String = when (step) {
        ClassroomStep.LEARN -> stages[0]
        ClassroomStep.TOGETHER -> stages[1]
        ClassroomStep.YOUR_TURN -> stages[2]
        ClassroomStep.QUICK_CHECK -> stages[3]
        ClassroomStep.RESULT -> stages[4]
        ClassroomStep.REST -> stages[5]
        else -> stages[6]
    }
}

fun classroomCopy(language: AppLanguage): ClassroomCopy = when (language) {
    AppLanguage.ENGLISH -> ClassroomCopy(
        listOf("Learn", "Together", "Your turn", "Quick check", "Your result", "Well done", "Your lesson"),
        "Continue", "Try again", "Getting your lesson ready…", "Your lesson could not load. Try again.",
        "Say it with me, then record your answer.", "Listen, then say your answer.",
    )
    AppLanguage.YORUBA -> ClassroomCopy(
        listOf("Kọ́ ẹ̀kọ́", "Jọ̀wọ́ sọ pẹ̀lú mi", "Ìwọ ló kàn", "Ìbéèrè kékeré", "Èsì rẹ", "Ó dára", "Ẹ̀kọ́ rẹ"),
        "Tẹ̀síwájú", "Gbìyànjú lẹ́ẹ̀kan sí i", "À ń mú ẹ̀kọ́ rẹ sílẹ̀…", "Ẹ̀kọ́ rẹ kò ṣí. Gbìyànjú lẹ́ẹ̀kan sí i.",
        "Sọ pẹ̀lú mi, lẹ́yìn náà gba ìdáhùn rẹ sílẹ̀.", "Gbọ́, lẹ́yìn náà sọ ìdáhùn rẹ.",
    )
    AppLanguage.PIDGIN -> ClassroomCopy(
        listOf("Learn", "Make we do am together", "Your turn", "Small check", "Your result", "You do well", "Your lesson"),
        "Continue", "Try again", "We dey get your lesson ready…", "Your lesson no load. Try again.",
        "Talk am with me, then record your answer.", "Listen, then talk your answer.",
    )
}
