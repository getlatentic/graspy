package com.latentic.graspy.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.latentic.graspy.BuildConfig
import com.latentic.graspy.home.HomeCatalogueViewModel
import com.latentic.graspy.home.HomeScreen
import com.latentic.graspy.account.Account
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnerProfile
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.practice.PracticeLessonScreen
import com.latentic.graspy.practice.PracticeLessonViewModel
import com.latentic.graspy.practice.SpeechTurnScreen
import com.latentic.graspy.practice.Teacher

@Composable
fun GraspyRoot(
    copy: AppCopy,
    accountCopy: AccountCopy,
    appLanguage: AppLanguage,
    interfaceLanguage: InterfaceLanguage,
    profile: LearnerProfile,
    account: Account,
    menu: AccountMenu,
) {
    val lessonViewModel: PracticeLessonViewModel = viewModel(key = "practice-lesson")
    val homeViewModel: HomeCatalogueViewModel = viewModel(key = "home-catalogue")
    val chatOpen by lessonViewModel.chatOpen.collectAsStateWithLifecycle()
    var contributing by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(appLanguage, profile.schoolClass) { lessonViewModel.prepare(appLanguage, profile.schoolClass) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            // A lesson is a white page, edge to edge, so the strip behind the status bar matches it.
            .background(if (chatOpen && !contributing) Graspy.Surface else Graspy.Background)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // A lesson carries its own header, so the app's one would be a second row of adult chrome
        // above a screen meant for a child.
        if (!chatOpen || contributing) {
            GraspyHeader(
                copy = copy,
                accountCopy = accountCopy,
                learner = requireNotNull(account.learner),
                email = account.email,
                menu = menu.copy(onContribute = if (BuildConfig.DATASET_RECORDING) { { contributing = true } } else null),
            )
        }
        AnimatedContent(
            targetState = when {
                contributing -> Screen.CONTRIBUTE
                chatOpen -> Screen.LESSON
                else -> Screen.HOME
            },
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "graspy screen",
            modifier = Modifier.weight(1f),
        ) { screen ->
            when (screen) {
                Screen.HOME -> {
                    val catalogue by homeViewModel.state.collectAsStateWithLifecycle()
                    LaunchedEffect(appLanguage, profile.schoolClass) {
                        homeViewModel.open(appLanguage, profile.schoolClass)
                    }
                    val teacher = Teacher.forClass(profile.schoolClass).first()
                    HomeScreen(
                        copy = copy,
                        state = catalogue,
                        teacherName = teacher.name,
                        teacherInitial = teacher.initial,
                        language = appLanguage.displayName,
                        onStartLesson = { lessonViewModel.openChat() },
                        onOpenLesson = { planId -> lessonViewModel.openChat(planId) },
                        onRetry = { homeViewModel.open(appLanguage, profile.schoolClass) },
                    )
                }
                Screen.LESSON -> PracticeLessonScreen(
                    copy = copy,
                    appLanguage = appLanguage,
                    interfaceLanguage = interfaceLanguage,
                    languageSelection = profile.language,
                    schoolClass = profile.schoolClass,
                    teacher = Teacher.forClass(profile.schoolClass).first(),
                    lessonViewModel = lessonViewModel,
                    onBack = lessonViewModel::closeChat,
                )
                Screen.CONTRIBUTE -> SpeechTurnScreen(
                    copy = copy,
                    modeLabel = copy.contribute,
                    disclosure = copy.contributionDisclosure,
                    onBack = { contributing = false },
                )
            }
        }
    }
}

/**
 * One thing at a time, reached by going in and coming back. There is no tab bar: a learner who
 * cannot read has one job, and donating a voice recording is an adult's decision, not a peer of it.
 */
private enum class Screen { HOME, LESSON, CONTRIBUTE }
