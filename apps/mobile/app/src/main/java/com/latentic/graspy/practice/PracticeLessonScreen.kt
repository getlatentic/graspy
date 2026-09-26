package com.latentic.graspy.practice

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.collection.CollectionViewModel
import com.latentic.graspy.collection.text
import com.latentic.graspy.localization.*
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.animationsAllowed
import com.latentic.graspy.ui.space

/** Layout passes to allow before scrolling to the foot: the thread and the card arrive over several. */
private const val SETTLE_FRAMES = 3

/** Long enough to be followed by a five-year-old, short enough not to be waited on. */
private const val MOTION_MS = 220

@Composable
fun PracticeLessonScreen(
    copy: AppCopy,
    appLanguage: AppLanguage,
    interfaceLanguage: InterfaceLanguage,
    languageSelection: AppLanguageSelection,
    schoolClass: SchoolClass,
    teacher: Teacher = Teacher.AUNTY_CHIOMA,
    collectionViewModel: CollectionViewModel = viewModel(key = "practice", factory = CollectionViewModel.Factory),
    lessonViewModel: PracticeLessonViewModel = viewModel(key = "practice-lesson", factory = PracticeLessonViewModel.Factory),
    onBack: (() -> Unit)? = null,
) {
    val classroom by lessonViewModel.classroom.collectAsStateWithLifecycle()
    val thread by lessonViewModel.thread.collectAsStateWithLifecycle()
    val recording by collectionViewModel.state.collectAsStateWithLifecycle()
    val voice by lessonViewModel.teacherVoice.state.collectAsStateWithLifecycle()
    val voiceLevels by collectionViewModel.voiceLevels.collectAsStateWithLifecycle()
    val droppedTakes by collectionViewModel.droppedTakes.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val conversation = rememberScrollState()
    val exercise = classroom.move?.exercise
    val speaking = voice == TeacherVoiceState.SPEAKING || voice == TeacherVoiceState.BUFFERING
    val floor = lessonFloor(classroom, voice, recording.isRecording, recording.isSaving)
    // Told once a lesson that any language is welcome; after the child's first answer it is known.
    var answeredThisLesson by rememberSaveable(classroom.move?.planId) { mutableStateOf(false) }

    LaunchedEffect(appLanguage, schoolClass) {
        lessonViewModel.prepare(appLanguage, schoolClass)
        collectionViewModel.selectLanguagePair(appLanguage.practiceLanguagePair(), languageSelection.declaredSpokenLanguage())
    }
    /** The newest note sits at the foot of the conversation, once the content has settled there. */
    LaunchedEffect(classroom.key, classroom.step, thread?.size) {
        repeat(SETTLE_FRAMES) { withFrameNanos { } }
        conversation.animateScrollTo(conversation.maxValue)
    }
    LaunchedEffect(voice, classroom.key, classroom.step) {
        if (voice == TeacherVoiceState.FAILED) lessonViewModel.teacherVoiceUnavailable()
        else lessonViewModel.speakIfUnheard()
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        lessonViewModel.recording = recording.isRecording
        lessonViewModel.resume()
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { lessonViewModel.pause() }
    DisposableEffect(Unit) { onDispose { lessonViewModel.pause() } }
    LaunchedEffect(recording.isRecording) {
        val wasRecording = lessonViewModel.recording
        lessonViewModel.recording = recording.isRecording
        if (!wasRecording && recording.isRecording) {
            answeredThisLesson = true
            lessonViewModel.recordingStarted()
        }
        if (wasRecording && !recording.isRecording) lessonViewModel.recordingEnded()
    }
    // Only a sent answer can move the lesson on, so only a sent answer asks for the next step. Asking
    // after a dropped take marked the question as waiting and took the microphone away for seconds.
    LaunchedEffect(recording.queuedLocalId) {
        if (recording.queuedLocalId != null) lessonViewModel.refresh()
    }
    LaunchedEffect(classroom.key, classroom.step) { collectionViewModel.clearFailure() }
    // Said once for each take dropped here, never for one dropped before the lesson was opened.
    val droppedWhenOpened = remember { droppedTakes }
    LaunchedEffect(droppedTakes) {
        if (droppedTakes > droppedWhenOpened) lessonViewModel.nothingHeard()
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        when {
            !granted -> collectionViewModel.reportPermissionDenied()
            // The dialog can outlast her silence: the microphone opens only if the turn is still the child's,
            // so her voice never lands in the answer.
            floor == LessonFloor.CHILD -> collectionViewModel.startRecording(requireNotNull(exercise), classroom.planEvent)
        }
    }
    val record = {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            collectionViewModel.startRecording(requireNotNull(exercise), classroom.planEvent)
        } else permission.launch(Manifest.permission.RECORD_AUDIO)
    }

    val motion = animationsAllowed()
    // An unheard take replaces the invitation to speak, never joins it.
    val rejected = recordingFailureMessage(copy, recording.failureReason)
        .takeIf { classroom.step != ClassroomStep.RESULT && !recording.isRecording }

    Surface(Modifier.fillMaxSize(), color = GraspyColor.Surface) {
        Column(Modifier.fillMaxSize()) {
            LessonHeader(classroom, onBack)
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(conversation)
                    .padding(horizontal = space(5), vertical = space(3)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(space(4), Alignment.Top),
            ) {
                // She stays on screen while an answer is checked, thinking, so the question does not jump
                // up the screen the moment the child finishes speaking.
                if (classroom.move != null || classroom.turn != null) {
                    val mood = when {
                        floor == LessonFloor.CHILD_SPEAKING -> TeacherMood.LISTENING
                        // Her mouth moves only once sound is coming out; fetching her line is thinking.
                        voice == TeacherVoiceState.SPEAKING -> TeacherMood.TALKING
                        floor == LessonFloor.CHECKING || classroom.waitingForTeacher ||
                            voice == TeacherVoiceState.BUFFERING -> TeacherMood.THINKING
                        classroom.celebratesAnswer() -> TeacherMood.PLEASED
                        else -> TeacherMood.RESTING
                    }
                    TeacherFace(
                        mood,
                        teacher,
                        onTap = when {
                            !classroom.canListen -> null
                            speaking -> lessonViewModel::hush
                            else -> lessonViewModel::play
                        },
                    )
                    // Only whose voice it is gets a pill. The slot keeps its height so the numbers never jump.
                    AnimatedContent(
                        targetState = turnCue(floor, voice),
                        modifier = Modifier.height(STATUS_SLOT),
                        contentAlignment = Alignment.Center,
                        transitionSpec = { crossfade(motion) },
                        label = "whose turn",
                    ) { cue ->
                        when (cue) {
                            TurnCue.YOUR_TURN -> StatusPill(copy.lesson.yourTurn, Icons.Rounded.GraphicEq)
                            TurnCue.TEACHER_SPEAKING ->
                                StatusPill(copy.lesson.teacherSpeaking, Icons.AutoMirrored.Rounded.VolumeUp)
                            null -> Unit
                        }
                    }
                }
                AnimatedContent(
                    targetState = classroom.key to classroom.step,
                    transitionSpec = {
                        val ms = if (motion) MOTION_MS else 0
                        (fadeIn(tween(ms)) + slideInVertically(tween(ms)) { it / 8 })
                            .togetherWith(fadeOut(tween(ms)))
                    },
                    label = "lesson stage",
                ) { shown ->
                    // AnimatedContent lays its children out in a Box, so the stage needs its own
                    // column or every line it draws lands on top of the last one.
                    key(shown) {
                    Column(
                        Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(space(3.5)),
                    ) {
                        LessonStage(classroom, copy, appLanguage)
                    }
                    }
                }
                // Something went wrong: said under the lesson, so the button below never moves for it.
                Settling(voice == TeacherVoiceState.FAILED, motion) {
                    Text(copy.lesson.teacherAudioFailed, color = GraspyColor.Danger)
                }
                Settling(recording.problem != null, motion) {
                    Text(recording.problem?.text(copy).orEmpty(), color = GraspyColor.Danger)
                }
            }
            // The one button sits in a foot of fixed height outside the scrolling lesson, so however long
            // the lesson's words are, it stays in the same place for the whole lesson.
            Column(
                Modifier.fillMaxWidth().padding(bottom = space(3)),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                val button = turnButton(floor, classroom)
                val waiting = when {
                    floor == LessonFloor.CHECKING ->
                        if (classroom.turn?.serverSampleId == null) copy.lesson.sending else copy.lesson.analysing
                    classroom.waitingForTeacher -> copy.lesson.waitingForTeacher
                    else -> copy.lesson.loading
                }
                val caption = when (button) {
                    TurnButton.STOP_TEACHER -> null
                    TurnButton.HEAR_AGAIN -> copy.lesson.playAgain
                    TurnButton.RECORD -> rejected ?: copy.lesson.sayItYourWay.takeUnless { answeredThisLesson }
                    TurnButton.FINISH -> copy.lesson.speakNow
                    TurnButton.WAIT -> waiting
                    TurnButton.RETRY -> copy.lesson.loadFailed
                }
                RoundTurnButton(
                    button,
                    level = voiceLevels.lastOrNull() ?: 0f,
                    description = when (button) {
                        TurnButton.RECORD -> copy.lesson.recordTable
                        TurnButton.FINISH -> copy.lesson.stopAndSend
                        TurnButton.RETRY -> copy.home.retry
                        else -> caption ?: copy.lesson.teacherSpeaking
                    },
                    motionMs = if (motion) MOTION_MS else 0,
                    onTap = when (button) {
                        TurnButton.STOP_TEACHER -> lessonViewModel::hush
                        TurnButton.HEAR_AGAIN -> lessonViewModel::play
                        TurnButton.RECORD -> record
                        // Sent as it is: the recorder itself drops a take with no voice in it.
                        TurnButton.FINISH -> { { collectionViewModel.stopAndQueue(requireNotNull(exercise)) } }
                        TurnButton.RETRY -> lessonViewModel::refresh
                        TurnButton.WAIT -> { {} }
                    },
                )
                Column(
                    Modifier.fillMaxWidth().height(CAPTION_SLOT),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(space(1.5)),
                ) {
                    caption?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (it == rejected) GraspyColor.Danger else GraspyColor.Muted,
                            textAlign = TextAlign.Center,
                        )
                    }
                    if (button == TurnButton.FINISH) VoiceWave(voiceLevels, color = GraspyColor.Accent, idleColor = GraspyColor.Line)
                }
            }
        }
    }
}

private val STATUS_SLOT = 40.dp

/** Tall enough for the open microphone's caption: "Speak now" and the wave under it. */
private val CAPTION_SLOT = 76.dp

private fun crossfade(motion: Boolean): ContentTransform {
    val ms = if (motion) MOTION_MS else 0
    return fadeIn(tween(ms)) togetherWith fadeOut(tween(ms))
}

/**
 * Something that comes and goes at the foot of the screen without shoving what is above it.
 *
 * The height is animated rather than switched, so a timer appearing reads as the screen making room
 * rather than as the question jumping away.
 */
@Composable
private fun Settling(visible: Boolean, motion: Boolean, content: @Composable () -> Unit) {
    val ms = if (motion) MOTION_MS else 0
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(ms)) + expandVertically(tween(ms)),
        exit = fadeOut(tween(ms)) + shrinkVertically(tween(ms)),
    ) { content() }
}

/** A capture the phone rejected before upload; a rejected turn says the same thing on its result. */
internal fun recordingFailureMessage(copy: AppCopy, reason: String?): String? =
    if (reason == NO_SPEECH) copy.lesson.noSpeech else null
