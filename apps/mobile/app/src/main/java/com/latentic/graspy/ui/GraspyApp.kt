package com.latentic.graspy.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.core.os.ConfigurationCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.account.Account
import com.latentic.graspy.account.AccountGraph
import com.latentic.graspy.auth.SignInScreen
import com.latentic.graspy.auth.SignInViewModel
import com.latentic.graspy.auth.SignOutDialogs
import com.latentic.graspy.auth.SignOutViewModel
import com.latentic.graspy.collection.outbox.AppGraph
import com.latentic.graspy.learners.LearnerPickerScreen
import com.latentic.graspy.learners.LearnersScreen
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.localization.AppLanguageSelection
import com.latentic.graspy.localization.LearnerProfile
import com.latentic.graspy.localization.LearnerProfileStore
import com.latentic.graspy.localization.accountCopyFor
import com.latentic.graspy.localization.copyFor
import com.latentic.graspy.localization.resolveAppLanguage

/** Signed out, choosing who is learning, managing learners, or learning as the learner chosen. */
@Composable
fun GraspyApp() {
    val context = LocalContext.current
    val graph = remember { AppGraph.account(context.applicationContext) }
    val account by graph.accounts.account.collectAsStateWithLifecycle()
    val learnerViewModels: LearnerViewModels = viewModel()
    SideEffect { learnerViewModels.keepOnly(account?.learnerKey) }
    val profile = rememberProfile(graph.profiles, account?.learnerKey)
    val language = appLanguage(profile.value)
    val accountCopy = accountCopyFor(language)
    val signOut: SignOutViewModel = viewModel()
    val signingOut by signOut.state.collectAsStateWithLifecycle()

    GraspyTheme {
        val signedIn = account
        if (signedIn == null) {
            val signIn: SignInViewModel = viewModel()
            val state by signIn.state.collectAsStateWithLifecycle()
            SignInScreen(accountCopy, state, signIn::signIn)
        } else {
            SignedIn(graph, signedIn, profile, language, accountCopy, learnerViewModels, signOut::start)
        }
        SignOutDialogs(accountCopy, signingOut, signOut::anyway, signOut::cancel)
    }
}

@Composable
private fun SignedIn(
    graph: AccountGraph,
    account: Account,
    profile: MutableState<LearnerProfile?>,
    language: AppLanguage,
    accountCopy: AccountCopy,
    learnerViewModels: LearnerViewModels,
    onSignOut: () -> Unit,
) {
    val screens: AccountScreens = viewModel()
    val screen by screens.screen.collectAsStateWithLifecycle()
    val learnerKey = account.learnerKey
    val learning = { screens.show(AccountScreen.LEARNING) }
    when {
        learnerKey != null && screen == AccountScreen.LEARNERS ->
            LearnersScreen(accountCopy, account.learner?.id, viewModel(), learning) { screens.show(AccountScreen.PICKER) }
        learnerKey == null || screen == AccountScreen.PICKER ->
            LearnerPickerScreen(accountCopy, account, viewModel(), learning.takeIf { learnerKey != null }, learning)
        else -> Learning(
            graph = graph,
            account = account,
            learnerKey = learnerKey,
            profile = profile,
            language = language,
            accountCopy = accountCopy,
            learnerViewModels = learnerViewModels,
            menu = AccountMenu(
                onSwitchLearner = { screens.show(AccountScreen.PICKER) },
                onManageLearners = { screens.show(AccountScreen.LEARNERS) },
                onEditProfile = {},
                onContribute = null,
                onSignOut = onSignOut,
            ),
        )
    }
}

/** A learner new to this device is asked their class first; one who learned here before keeps theirs. */
@Composable
private fun Learning(
    graph: AccountGraph,
    account: Account,
    learnerKey: String,
    profile: MutableState<LearnerProfile?>,
    language: AppLanguage,
    accountCopy: AccountCopy,
    learnerViewModels: LearnerViewModels,
    menu: AccountMenu,
) {
    val context = LocalContext.current
    var editingProfile by rememberSaveable { mutableStateOf(false) }
    val copy = copyFor(language)
    LaunchedEffect(learnerKey) {
        AppGraph.submissionRepository(context.applicationContext).recoverIncomplete(learnerKey)
    }
    val current = profile.value
    if (current == null || editingProfile) {
        OnboardingScreen(copy = copy, initial = current, askLanguage = editingProfile) { chosen ->
            graph.profiles.save(learnerKey, chosen)
            profile.value = chosen
            editingProfile = false
        }
        return
    }
    LearnerScope(learnerKey, learnerViewModels) {
        GraspyRoot(copy, accountCopy, language, current, account, menu.copy(onEditProfile = { editingProfile = true }))
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

/** Before a learner is chosen, the phone's own language. */
@Composable
private fun appLanguage(profile: LearnerProfile?): AppLanguage {
    val phoneLanguage = ConfigurationCompat.getLocales(LocalConfiguration.current).get(0)?.toLanguageTag().orEmpty()
    return resolveAppLanguage(profile?.language ?: AppLanguageSelection.SYSTEM, phoneLanguage)
}
