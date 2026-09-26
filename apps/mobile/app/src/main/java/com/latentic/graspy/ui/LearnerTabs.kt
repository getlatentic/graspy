package com.latentic.graspy.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.account.Account
import com.latentic.graspy.ask.AskTab
import com.latentic.graspy.ask.AskViewModel
import com.latentic.graspy.ask.LinkTarget
import com.latentic.graspy.home.HomeCatalogueViewModel
import com.latentic.graspy.home.HomeTab
import com.latentic.graspy.home.VoiceLessons
import com.latentic.graspy.lesson.TopicLesson
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.LearnCopy
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.mcp.LearnerViews
import com.latentic.graspy.onboarding.DetailsFormViewModel
import com.latentic.graspy.plan.LearnerPlan
import com.latentic.graspy.plan.PlanState
import com.latentic.graspy.plan.PlanViewModel
import com.latentic.graspy.plan.countryName
import com.latentic.graspy.plan.details
import com.latentic.graspy.plan.languageName
import com.latentic.graspy.plan.lessonTarget
import com.latentic.graspy.plan.levelLabel
import com.latentic.graspy.plan.withDetails
import com.latentic.graspy.practice.Teacher
import com.latentic.graspy.subjects.PlanUnread
import com.latentic.graspy.subjects.SubjectTopics
import com.latentic.graspy.subjects.SubjectsTab
import com.latentic.graspy.ui.tabs.LearnTab
import com.latentic.graspy.ui.tabs.TabBar
import com.latentic.graspy.you.DetailsScreen
import com.latentic.graspy.you.LearnerDetail
import com.latentic.graspy.you.YouTab
import java.util.Locale
import kotlinx.coroutines.launch

/** Where the learner is inside a tab: a subject's topics, or one topic's lesson, whose way back is its subject. */
private data class Place(val subjectSlug: String, val topicIndex: Int? = null) {
    fun back(): Place? = if (topicIndex != null) copy(topicIndex = null) else null
}

@Composable
internal fun LearnerTabs(
    copy: AppCopy,
    learn: LearnCopy,
    appLanguage: AppLanguage,
    interfaceLanguage: InterfaceLanguage,
    voice: LearnerProfile?,
    account: Account,
    menu: AccountMenu,
    onReplan: () -> Unit,
    openVoiceLesson: (String?) -> Unit,
) {
    val planViewModel: PlanViewModel = viewModel()
    val plan by planViewModel.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(LearnTab.HOME) }
    var place by rememberSaveable(stateSaver = placeSaver) { mutableStateOf<Place?>(null) }
    var editing by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(tab) { planViewModel.refresh() }
    BackHandler(enabled = place != null || editing || tab != LearnTab.HOME) {
        val current = place
        when {
            current != null -> place = current.back()
            editing -> editing = false
            else -> tab = LearnTab.HOME
        }
    }
    val follow = { target: LinkTarget ->
        when (target) {
            is LinkTarget.Lesson -> place = Place(target.subjectSlug, target.topicIndex)
            is LinkTarget.Subject -> place = Place(target.subjectSlug)
            LinkTarget.Subjects -> {
                place = null
                tab = LearnTab.SUBJECTS
            }
        }
    }

    Column(Modifier.fillMaxSize().background(GraspyColor.Canvas).statusBarsPadding().navigationBarsPadding().imePadding()) {
        GraspyHeader()
        Box(Modifier.weight(1f)) {
            val shown = place
            val ready = plan as? PlanState.Ready
            when {
                shown != null && ready != null -> Page { OpenPlace(learn, interfaceLanguage, ready, shown, onPlace = { place = it }, onLearnt = planViewModel::refresh) }
                editing && ready != null -> Page { Details(learn, ready.plan, interfaceLanguage, planViewModel, onBack = { editing = false }, onReplan = onReplan) }
                tab == LearnTab.ASK -> AskPane(learn, interfaceLanguage, plan, planViewModel, follow) { tab = LearnTab.HOME }
                else -> Page {
                    when (tab) {
                        LearnTab.HOME -> Home(copy, learn, appLanguage, voice, plan, planViewModel, openVoiceLesson, onPlace = { place = it }) { tab = LearnTab.SUBJECTS }
                        LearnTab.SUBJECTS -> SubjectsTab(learn, plan, onOpenSubject = { place = Place(it.slug) }, onRetry = planViewModel::refresh)
                        else -> YouTab(learn, plan, learnerDetails(learn, plan, interfaceLanguage), account, menu.copy(onEditProfile = { editing = true }))
                    }
                }
            }
        }
        TabBar(learn.nav, tab) {
            tab = it
            place = null
            editing = false
        }
    }
}

@Composable
private fun Page(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = space(4), vertical = space(6))) {
        content()
    }
}

@Composable
private fun Home(
    copy: AppCopy,
    learn: LearnCopy,
    appLanguage: AppLanguage,
    voice: LearnerProfile?,
    plan: PlanState,
    planViewModel: PlanViewModel,
    openVoiceLesson: (String?) -> Unit,
    onPlace: (Place) -> Unit,
    onSeeAllSubjects: () -> Unit,
) {
    val making by planViewModel.makingState.collectAsStateWithLifecycle()
    HomeTab(
        learn = learn,
        plan = plan,
        making = making,
        onRetryMaking = planViewModel::retryMaking,
        onOpenTopic = { subject, index -> onPlace(Place(subject.slug, index)) },
        onOpenSubject = { onPlace(Place(it.slug)) },
        onSeeAllSubjects = onSeeAllSubjects,
        voiceLessons = voice?.let { profile -> { VoiceLessonsSection(copy, appLanguage, profile, openVoiceLesson) } },
    )
}

@Composable
private fun OpenPlace(learn: LearnCopy, interfaceLanguage: InterfaceLanguage, ready: PlanState.Ready, place: Place, onPlace: (Place?) -> Unit, onLearnt: () -> Unit) {
    val subject = ready.plan.subject(place.subjectSlug)
    if (subject == null) {
        LaunchedEffect(place) { onPlace(null) }
        return
    }
    val target = place.topicIndex?.let { lessonTarget(ready.plan, subject, it, ready.marks) }
    if (target == null) {
        SubjectTopics(learn, ready, subject, onBack = { onPlace(null) }, onOpenTopic = { onPlace(place.copy(topicIndex = it)) })
    } else {
        val views: LearnerViews = viewModel()
        TopicLesson(learn, interfaceLanguage.tag, views, target, onBack = { onPlace(place.back()) }, onLearnt = onLearnt)
    }
}

@Composable
private fun Details(learn: LearnCopy, plan: LearnerPlan, interfaceLanguage: InterfaceLanguage, planViewModel: PlanViewModel, onBack: () -> Unit, onReplan: () -> Unit) {
    val form: DetailsFormViewModel = viewModel()
    val current = plan.details()
    LaunchedEffect(plan.planId) { form.load(current) }
    val scope = rememberCoroutineScope()
    DetailsScreen(
        learn = learn,
        form = form,
        current = current,
        display = Locale.forLanguageTag(interfaceLanguage.tag),
        onBack = onBack,
        onNewPlan = { onReplan() },
        onKeepPlan = { details ->
            scope.launch {
                runCatching { planViewModel.apply(plan.withDetails(details)) }
                onBack()
            }
        },
    )
}

@Composable
private fun AskPane(learn: LearnCopy, interfaceLanguage: InterfaceLanguage, plan: PlanState, planViewModel: PlanViewModel, follow: (LinkTarget) -> Unit, onRebuilt: () -> Unit) {
    val ready = plan as? PlanState.Ready
    if (ready == null) {
        Page { PlanUnread(learn, planViewModel::refresh) }
        return
    }
    val ask: AskViewModel = viewModel()
    val views: LearnerViews = viewModel()
    val turn by ask.turnState.collectAsStateWithLifecycle()
    LaunchedEffect(turn.rebuilt) { if (turn.rebuilt != null) onRebuilt() }
    AskTab(learn, interfaceLanguage.tag, views, ask, ready, planViewModel, follow)
}

@Composable
private fun VoiceLessonsSection(copy: AppCopy, appLanguage: AppLanguage, profile: LearnerProfile, openVoiceLesson: (String?) -> Unit) {
    val homeViewModel: HomeCatalogueViewModel = viewModel(key = "home-catalogue")
    val catalogue by homeViewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(appLanguage, profile.schoolClass) { homeViewModel.open(appLanguage, profile.schoolClass) }
    val teacher = Teacher.forClass(profile.schoolClass).first()
    VoiceLessons(
        copy = copy,
        state = catalogue,
        teacherName = teacher.name,
        teacherInitial = teacher.initial,
        language = appLanguage.displayName,
        onStartLesson = { openVoiceLesson(null) },
        onOpenLesson = { planId -> openVoiceLesson(planId) },
        onRetry = { homeViewModel.open(appLanguage, profile.schoolClass) },
    )
}

/** The web's details card: the plan's country, language and class, named in the learner's words. */
private fun learnerDetails(learn: LearnCopy, plan: PlanState, interfaceLanguage: InterfaceLanguage): List<LearnerDetail> {
    val shared = (plan as? PlanState.Ready)?.plan ?: return emptyList()
    val display = Locale.forLanguageTag(interfaceLanguage.tag)
    val details = shared.details()
    return listOf(
        LearnerDetail(learn.you.country, details.country.takeIf(String::isNotBlank)?.let { countryName(it, display) } ?: shared.countryShown),
        LearnerDetail(learn.you.language, details.language.takeIf(String::isNotBlank)?.let { languageName(it, display) } ?: shared.languageShown),
        LearnerDetail(learn.you.grade, shared.levelLabel(learn)),
    ).filter { it.value.isNotBlank() }
}

private val placeSaver = Saver<Place?, List<Any>>(
    save = { place -> place?.let { listOfNotNull(it.subjectSlug, it.topicIndex) } ?: emptyList() },
    restore = { saved -> (saved.firstOrNull() as? String)?.let { Place(it, saved.getOrNull(1) as? Int) } },
)
