package com.latentic.graspy.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.account.Account
import com.latentic.graspy.collection.VoiceConsent
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.learnCopyFor
import com.latentic.graspy.practice.PracticeLessonScreen
import com.latentic.graspy.practice.PracticeLessonViewModel
import com.latentic.graspy.practice.Teacher

/**
 * A learner's app: the web's four tabs, with a subject and a lesson opening over them, and a voice lesson
 * taking the whole screen, as a lesson meant for a child should. [voice] is null for a class with no voice lessons.
 */
@Composable
fun GraspyRoot(
    copy: AppCopy,
    appLanguage: AppLanguage,
    interfaceLanguage: InterfaceLanguage,
    voice: LearnerProfile?,
    account: Account,
    menu: AccountMenu,
    onReplan: () -> Unit,
) {
    val lessonViewModel: PracticeLessonViewModel = viewModel(key = "practice-lesson", factory = PracticeLessonViewModel.Factory)
    val chatOpen by lessonViewModel.chatOpen.collectAsStateWithLifecycle()
    LaunchedEffect(appLanguage, voice?.schoolClass) { voice?.let { lessonViewModel.prepare(appLanguage, it.schoolClass) } }
    val voiceNote = rememberVoiceNote(account)
    val learn = learnCopyFor(interfaceLanguage)

    if (chatOpen && voice != null) {
        Box(Modifier.fillMaxSize().background(GraspyColor.Surface).statusBarsPadding().navigationBarsPadding()) {
            PracticeLessonScreen(
                copy = copy,
                appLanguage = appLanguage,
                interfaceLanguage = interfaceLanguage,
                languageSelection = voice.language,
                schoolClass = voice.schoolClass,
                teacher = Teacher.forClass(voice.schoolClass).first(),
                lessonViewModel = lessonViewModel,
                onBack = lessonViewModel::closeChat,
            )
        }
        return
    }
    LearnerTabs(copy, learn, appLanguage, interfaceLanguage, voice, account, menu, onReplan) { planId ->
        voiceNote.before { lessonViewModel.openChat(planId) }
    }
    voiceNote.Shown(learn)
}

/** The note before a learner's first voice lesson: the lesson waits for its OK. */
private class VoiceNote(private val consent: VoiceConsent) {
    private var waiting by mutableStateOf<(() -> Unit)?>(null)

    fun before(open: () -> Unit) {
        if (consent.needed()) waiting = open else open()
    }

    @Composable
    fun Shown(learn: LearnCopy) {
        val open = waiting ?: return
        VoiceNoteDialog(learn.voice, onOk = {
            consent.accept()
            waiting = null
            open()
        }, onDismiss = { waiting = null })
    }
}

@Composable
private fun rememberVoiceNote(account: Account): VoiceNote {
    val context = LocalContext.current
    return remember(account.learnerKey) {
        val learnerKey = account.learnerKey
        VoiceNote(VoiceConsent(AppGraph.account(context.applicationContext).profiles) { learnerKey })
    }
}
