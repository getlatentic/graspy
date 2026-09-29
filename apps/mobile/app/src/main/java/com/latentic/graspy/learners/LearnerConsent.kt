package com.latentic.graspy.learners

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import com.latentic.graspy.consent.ConsentNotice
import com.latentic.graspy.consent.ConsentProblem
import com.latentic.graspy.consent.SERVICE_NOTICE
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.localization.withName
import com.latentic.graspy.ui.space

/**
 * A learner whose parent has yet to agree to graspy teaching them: the notice, and the parent's way to agree. Who
 * does not agree takes [onCancel], which leaves the learner unused.
 */
@Composable
fun LearnerConsent(
    copy: AccountCopy,
    learnerName: String,
    busy: Boolean,
    onAgree: () -> Unit,
    onCancel: () -> Unit,
    problem: ConsentProblem? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(space(5))) {
        AccountHeading(copy.consent.title.withName(learnerName))
        ConsentNotice(
            copy = copy,
            notice = SERVICE_NOTICE,
            busy = busy,
            onAgree = onAgree,
            onCancel = onCancel,
            problem = problem,
        )
    }
}
