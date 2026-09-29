package com.latentic.graspy.consent

import android.app.Activity
import com.latentic.graspy.auth.Confirmation
import com.latentic.graspy.auth.FreshSignIn
import com.latentic.graspy.auth.ParentConfirmation
import com.latentic.graspy.localization.AccountCopy
import com.latentic.graspy.network.refusalCode
import java.io.IOException
import kotlinx.coroutines.CancellationException

/** What became of asking a parent to agree. */
sealed interface Agreement<out T> {
    /** The parent signed in again and their agreement was recorded, giving [value]. */
    data class Recorded<T>(val value: T) : Agreement<T>

    /** The parent closed Google's sheet or page: nothing was recorded, and nothing went wrong. */
    data object Declined : Agreement<Nothing>

    /** The Google account is not the one signed in to graspy, by the phone's own check or the server's. */
    data object OtherAccount : Agreement<Nothing>

    /** Signing in again, or recording, failed. Asking again signs in again. */
    data class Failed(val error: Throwable) : Agreement<Nothing>
}

/** Google did not confirm the parent's sign-in. */
class SignInAgainFailed(reason: String) : IOException(reason)

/**
 * An agreement that did not go through, as a parent is told it: [SIGN_IN] when signing in again, or graspy's
 * check of it, did not hold, and asking again signs in again; [FAILED] for anything else.
 */
enum class ConsentProblem { OTHER_ACCOUNT, SIGN_IN, FAILED }

fun Agreement<*>.problem(): ConsentProblem? = when (this) {
    is Agreement.Recorded, Agreement.Declined -> null
    Agreement.OtherAccount -> ConsentProblem.OTHER_ACCOUNT
    is Agreement.Failed -> consentProblemOf(error)
}

/** What graspy names when the sign-in sent with an agreement does not hold, or the notice is not one it shows. */
private val SIGN_IN_REFUSALS = setOf("sign_in_stale", "sign_in_invalid", "sign_in_unchecked", "notice_unknown")

fun consentProblemOf(error: Throwable): ConsentProblem =
    if (error is SignInAgainFailed || refusalCode(error) in SIGN_IN_REFUSALS) ConsentProblem.SIGN_IN else ConsentProblem.FAILED

fun ConsentProblem.text(copy: AccountCopy): String = when (this) {
    ConsentProblem.OTHER_ACCOUNT -> copy.consent.otherAccount
    ConsentProblem.SIGN_IN -> copy.consent.signIn
    ConsentProblem.FAILED -> copy.failed
}

/**
 * The parent signs in with Google again over [activity], and [record] sends what they agreed to with the new ID
 * token, which is held no longer than this call. A refusal saying the Google account is another's is
 * [Agreement.OtherAccount]; any other, such as a sign-in older than the server accepts, is [Agreement.Failed].
 */
suspend fun <T> ParentConfirmation.agree(activity: Activity, record: suspend (FreshSignIn) -> T): Agreement<T> =
    when (val confirmation = confirm(activity)) {
        is Confirmation.Confirmed -> recorded(confirmation.signIn, record)
        Confirmation.Cancelled -> Agreement.Declined
        Confirmation.OtherAccount -> Agreement.OtherAccount
        is Confirmation.Failed -> Agreement.Failed(SignInAgainFailed(confirmation.reason))
    }

private suspend fun <T> recorded(signIn: FreshSignIn, record: suspend (FreshSignIn) -> T): Agreement<T> = try {
    Agreement.Recorded(record(signIn))
} catch (cancelled: CancellationException) {
    throw cancelled
} catch (error: Exception) {
    if (refusalCode(error) == OTHER_ACCOUNT) Agreement.OtherAccount else Agreement.Failed(error)
}

private const val OTHER_ACCOUNT = "sign_in_other_account"
