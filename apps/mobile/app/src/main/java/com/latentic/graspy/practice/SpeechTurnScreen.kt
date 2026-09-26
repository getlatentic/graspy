package com.latentic.graspy.practice

import com.latentic.graspy.ui.LeftToRight
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.latentic.graspy.collection.CollectionViewModel
import com.latentic.graspy.collection.text
import com.latentic.graspy.collection.outbox.SubmissionStatus
import com.latentic.graspy.localization.AppCopy
import com.latentic.graspy.ui.Correct
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.TextButton
import com.latentic.graspy.ui.tapping
import com.latentic.graspy.ui.Graspy
import com.latentic.graspy.ui.LanguageChoice
import com.latentic.graspy.ui.Retry

/** Contribute: one consented, language-labelled dataset recording of the 7 × 8 prompt. */
@Composable
fun SpeechTurnScreen(
    copy: AppCopy,
    modeLabel: String,
    disclosure: String,
    onBack: () -> Unit,
    collectionViewModel: CollectionViewModel = viewModel(key = "contribute"),
) {
    val state by collectionViewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val exercise = PracticeExercise.SevenTimesEight
    var feedbackResponse by rememberSaveable(state.serverSampleId) { mutableStateOf<Boolean?>(null) }
    val busy = state.isSaving || state.submissionStatus in setOf(SubmissionStatus.PENDING, SubmissionStatus.UPLOADING)
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) collectionViewModel.startRecording(PracticeExercise.SevenTimesEight) else collectionViewModel.reportPermissionDenied()
    }

    Surface(modifier = Modifier.fillMaxSize(), color = Graspy.Background) {
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            TextButton(onClick = tapping(onBack), contentPadding = PaddingValues(0.dp)) {
                Text(copy.back, color = Graspy.Brand, style = MaterialTheme.typography.labelLarge)
            }
            Text(modeLabel, color = Graspy.TextCaption, style = MaterialTheme.typography.labelMedium)
            Text(copy.contributeTitle, color = Graspy.Text, style = MaterialTheme.typography.headlineLarge)
            Card(
                colors = CardDefaults.cardColors(containerColor = Graspy.Surface),
                border = BorderStroke(1.dp, Graspy.Border),
                shape = RoundedCornerShape(20.dp),
            ) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(copy.question, color = Graspy.TextCaption, style = MaterialTheme.typography.labelMedium)
                    Text("7 × 8", color = Graspy.Text, fontSize = 48.sp, lineHeight = 54.sp, fontWeight = FontWeight.SemiBold, style = LeftToRight)
                    Text(copy.prompt, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyLarge)
                }
            }
            Text(disclosure, color = Graspy.TextMuted, style = MaterialTheme.typography.bodyMedium)
            if (!state.consentGranted) {
                OutlinedButton(onClick = collectionViewModel::grantConsent, border = BorderStroke(1.dp, Graspy.Border)) {
                    Text(copy.allowRecording, color = Graspy.Text)
                }
            } else {
                Text(copy.consentRecorded, color = Graspy.TextMuted, style = MaterialTheme.typography.labelLarge)
            }
            Text(copy.languagePair, color = Graspy.Text, style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LanguageChoice(copy.yorubaEnglish, state.languagePair == "yo-en", !state.isRecording && !busy) {
                    collectionViewModel.selectLanguagePair("yo-en")
                }
                LanguageChoice(copy.pidginEnglish, state.languagePair == "pcm-en", !state.isRecording && !busy) {
                    collectionViewModel.selectLanguagePair("pcm-en")
                }
            }
            Button(
                enabled = state.consentGranted && !busy,
                onClick = {
                    if (state.isRecording) {
                        collectionViewModel.stopAndQueue(exercise)
                    } else if (
                        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED
                    ) {
                        collectionViewModel.startRecording(PracticeExercise.SevenTimesEight)
                    } else {
                        permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Graspy.Action),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(
                    when {
                        busy -> copy.saving
                        state.isRecording -> copy.stopAndCheck
                        else -> copy.recordAnswer
                    },
                    color = Graspy.OnAction,
                    fontWeight = FontWeight.Bold,
                )
            }
            state.transcript?.let { transcript ->
                val resultColor = if (state.decision == PracticeDecision.CORRECT) Correct else Retry
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (state.decision == PracticeDecision.CORRECT) Graspy.SuccessSurface else Graspy.DangerSurface,
                    ),
                    border = BorderStroke(1.dp, resultColor),
                    shape = RoundedCornerShape(20.dp),
                ) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(copy.transcript, color = Graspy.TextCaption, style = MaterialTheme.typography.labelMedium)
                        Text(transcript, color = Graspy.Text, fontSize = 20.sp, lineHeight = 26.sp)
                        Text(localizedFeedback(copy, state.decision, state.parsedAnswer), color = resultColor, fontWeight = FontWeight.Bold)
                        Text(copy.feedbackQuestion, color = Graspy.TextMuted, fontSize = 14.sp)
                        if (feedbackResponse == null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { feedbackResponse = true }) { Text(copy.yes) }
                                OutlinedButton(onClick = { feedbackResponse = false }) { Text(copy.no) }
                            }
                        } else {
                            Text(copy.thanksForChecking, color = Graspy.TextMuted, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
            if (state.queuedLocalId != null && state.transcript == null) {
                val message = when (state.submissionStatus) {
                    SubmissionStatus.FAILED -> copy.retained
                    SubmissionStatus.COMPLETED -> copy.uploaded
                    else -> copy.queued
                }
                Text(message, color = Graspy.TextMuted)
            }
            (state.problem?.text(copy) ?: state.failureReason)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}

private fun localizedFeedback(copy: AppCopy, decision: PracticeDecision?, parsedAnswer: Int?): String =
    when (decision) {
        PracticeDecision.CORRECT -> copy.correctFeedback
        PracticeDecision.TRY_AGAIN -> copy.wrongAnswerTemplate.replace("%d", parsedAnswer?.toString() ?: "?")
        else -> copy.notUnderstoodFeedback
    }
