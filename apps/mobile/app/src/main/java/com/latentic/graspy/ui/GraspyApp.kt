package com.latentic.graspy.ui

import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.core.os.ConfigurationCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.account.Account
import com.latentic.graspy.account.AccountGraph
import com.latentic.graspy.account.LearnerDto
import com.latentic.graspy.auth.SignInScreen
import com.latentic.graspy.auth.SignInViewModel
import com.latentic.graspy.auth.SignOutDialogs
import com.latentic.graspy.auth.SignOutViewModel
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.learners.LearnerPickerScreen
import com.latentic.graspy.learners.LearnersScreen
import com.latentic.graspy.learners.ServiceConsentGate
import com.latentic.graspy.recordings.RecordingsScreen
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.InterfaceLanguage
import com.latentic.graspy.localization.InterfaceLanguageStore
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.accountCopyFor
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.localization.resolveAppLanguage
import com.latentic.graspy.localization.resolveInterfaceLanguage

/** Signed out, choosing who is learning, managing learners, or learning as the learner chosen. */
@Composable
fun GraspyApp() {
    val context = LocalContext.current
    val graph = remember { AppGraph.account(context.applicationContext) }
    val account by graph.accounts.account.collectAsStateWithLifecycle()
    val learnerViewModels: LearnerViewModels = viewModel()
    SideEffect { learnerViewModels.keepOnly(account?.learnerKey) }
    val profile = rememberProfile(graph.profiles, account?.learnerKey)
    val words = rememberInterfaceLanguage()
    val lessons = lessonLanguage(profile.value)
    val shown = resolveInterfaceLanguage(words.value, lessons.takeIf { profile.value != null }, phoneLanguageTag())
    val languages = Languages(lessons, shown, words)
    val accountCopy = accountCopyFor(languages.words)
    val signOut: SignOutViewModel = viewModel()
    val signingOut by signOut.state.collectAsStateWithLifecycle()

    GraspyTheme(languages.words) {
        CompositionLocalProvider(LocalLayoutDirection provides languages.words.layoutDirection) {
            val signedIn = account
            if (signedIn == null) {
                val signIn: SignInViewModel = viewModel()
                val state by signIn.state.collectAsStateWithLifecycle()
                val activity = checkNotNull(LocalActivity.current) { "The app is drawn in an activity" }
                SignInScreen(accountCopy, state) { signIn.signIn(activity) }
            } else {
                SignedIn(graph, signedIn, profile, languages, accountCopy, learnerViewModels, signOut::start)
            }
            SignOutDialogs(accountCopy, signingOut, signOut::anyway, signOut::cancel)
        }
    }
}

/**
 * The language the teacher speaks, chosen for each learner, and the language of the app's words,
 * chosen for the phone. [chosenWords] holds that choice: null follows the phone.
 */
private class Languages(val lesson: AppLanguage, val words: InterfaceLanguage, val chosenWords: MutableState<InterfaceLanguage?>)

@Composable
private fun SignedIn(
    graph: AccountGraph,
    account: Account,
    profile: MutableState<LearnerProfile?>,
    languages: Languages,
    accountCopy: AccountCopy,
    learnerViewModels: LearnerViewModels,
    onSignOut: () -> Unit,
) {
    val screens: AccountScreens = viewModel()
    val screen by screens.screen.collectAsStateWithLifecycle()
    val recordingsOf by screens.recordingsOf.collectAsStateWithLifecycle()
    val learnerKey = account.learnerKey
    val learner = account.learner
    val learning = { screens.show(AccountScreen.LEARNING) }
    val picking = { screens.show(AccountScreen.PICKER) }
    when {
        learnerKey != null && screen == AccountScreen.RECORDINGS && recordingsOf != null ->
            RecordingsOf(accountCopy, checkNotNull(recordingsOf)) { screens.show(AccountScreen.LEARNERS) }
        learnerKey != null && screen == AccountScreen.LEARNERS ->
            LearnersScreen(accountCopy, learner?.id, viewModel(), learning, picking, screens::showRecordingsOf)
        learnerKey == null || learner == null || screen == AccountScreen.PICKER ->
            LearnerPickerScreen(accountCopy, account, viewModel(), learning.takeIf { learnerKey != null }, learning)
        else -> ServiceConsentGate(accountCopy, learner, viewModel(key = "service-consent-${learner.id}"), picking) {
            Learning(
                graph = graph,
                account = account,
                learnerKey = checkNotNull(learnerKey),
                profile = profile,
                languages = languages,
                learnerViewModels = learnerViewModels,
                menu = AccountMenu(
                    onSwitchLearner = picking,
                    onManageLearners = { screens.show(AccountScreen.LEARNERS) },
                    onEditProfile = {},
                    onSignOut = onSignOut,
                ),
            )
        }
    }
}

/** One learner's voice recordings, for their parent: a view model of its own for each learner. */
@Composable
private fun RecordingsOf(copy: AccountCopy, learner: LearnerDto, onBack: () -> Unit) {
    RecordingsScreen(copy, learner, viewModel(key = "recordings-${learner.id}"), onBack)
}

/** The learner's plan comes first; the tabs, and voice lessons for a class that has them, follow it. */
@Composable
private fun Learning(
    graph: AccountGraph,
    account: Account,
    learnerKey: String,
    profile: MutableState<LearnerProfile?>,
    languages: Languages,
    learnerViewModels: LearnerViewModels,
    menu: AccountMenu,
) {
    val context = LocalContext.current
    LaunchedEffect(learnerKey) {
        AppGraph.submissionRepository(context.applicationContext).recoverIncomplete(learnerKey)
    }
    LearnerScope(learnerKey, learnerViewModels) {
        LearnerHome(copyFor(languages.words), languages.lesson, languages.words, account, learnerKey, profile, graph.profiles, menu) {
            languages.chosenWords.value = it
        }
    }
}

/** Read again on each return to the app: a marked answer can settle the learner's language. */
@Composable
private fun rememberProfile(profiles: LearnerProfileStore, learnerKey: String?): MutableState<LearnerProfile?> {
    val profile = remember(learnerKey) { mutableStateOf(learnerKey?.let(profiles::load)) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, learnerKey) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) profile.value = learnerKey?.let(profiles::load)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return profile
}

@Composable
private fun phoneLanguageTag(): String =
    ConfigurationCompat.getLocales(LocalConfiguration.current).get(0)?.toLanguageTag().orEmpty()

/** The language the teacher speaks; before a learner has chosen one, the phone's, when she speaks it. */
@Composable
private fun lessonLanguage(profile: LearnerProfile?): AppLanguage =
    resolveAppLanguage(profile?.language ?: AppLanguageSelection.SYSTEM, phoneLanguageTag())

/** Saved whenever it changes; it outlives signing out, as the web keeps it for the browser. */
@Composable
private fun rememberInterfaceLanguage(): MutableState<InterfaceLanguage?> {
    val store = InterfaceLanguageStore(LocalContext.current.applicationContext)
    val chosen = remember { mutableStateOf(store.chosen()) }
    LaunchedEffect(chosen.value) { store.choose(chosen.value) }
    return chosen
}
