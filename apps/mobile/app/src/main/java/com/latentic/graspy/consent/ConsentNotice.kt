package com.latentic.graspy.consent

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.ui.GraspyColor
import com.latentic.graspy.ui.GraspyRadius
import com.latentic.graspy.ui.PrimaryButton
import com.latentic.graspy.ui.ProblemNote
import com.latentic.graspy.ui.QuietButton
import com.latentic.graspy.ui.space

/**
 * A notice shown unchanged, and the parent's way to agree to it: signing in with Google again. A parent who does not
 * agree takes [onCancel], with the words [cancel].
 */
@Composable
fun ConsentNotice(
    copy: AccountCopy,
    notice: String,
    busy: Boolean,
    onAgree: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    cancel: String = copy.consent.decline,
    problem: ConsentProblem? = null,
    canAgree: Boolean = true,
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(space(4))) {
        Text(
            notice,
            color = GraspyColor.Ink,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .fillMaxWidth()
                .background(GraspyColor.AccentSoft, RoundedCornerShape(GraspyRadius.Card))
                .padding(space(4)),
        )
        Text(copy.consent.who, color = GraspyColor.Muted, style = MaterialTheme.typography.bodyMedium)
        problem?.let { ProblemNote(it.text(copy)) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(space(2)), verticalArrangement = Arrangement.spacedBy(space(2))) {
            PrimaryButton(if (busy) copy.signingIn else copy.consent.agree, onClick = onAgree, enabled = canAgree && !busy)
            QuietButton(cancel, onClick = onCancel, enabled = !busy)
        }
    }
}
