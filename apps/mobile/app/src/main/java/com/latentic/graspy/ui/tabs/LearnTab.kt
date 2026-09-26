package com.latentic.graspy.ui.tabs

import com.latentic.graspy.localization.NavCopy
import com.latentic.graspy.ui.icons.Lucide

/** The web's four sections (features/learn/lib/app-sections.ts), in its order and with its icons. */
enum class LearnTab(val icon: Lucide, val label: (NavCopy) -> String) {
    HOME(Lucide.House, NavCopy::home),
    SUBJECTS(Lucide.BookOpen, NavCopy::subjects),
    ASK(Lucide.MessageCircle, NavCopy::ask),
    YOU(Lucide.UserRound, NavCopy::you),
}

/** As the web's sectionsFor: Subjects and Ask are read, so a class that learns by voice alone has neither. */
fun learnTabs(voiceOnly: Boolean): List<LearnTab> =
    if (voiceOnly) listOf(LearnTab.HOME, LearnTab.YOU) else LearnTab.entries
