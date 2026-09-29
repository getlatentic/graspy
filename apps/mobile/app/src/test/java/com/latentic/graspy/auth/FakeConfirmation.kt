package com.latentic.graspy.auth

import android.app.Activity

/** The parent signing in with Google again: what each try ends as, and what it was shown over. */
class FakeConfirmation(var next: Confirmation = confirmed()) : ParentConfirmation {
    val shownOver = mutableListOf<Activity>()

    override suspend fun confirm(activity: Activity): Confirmation {
        shownOver += activity
        return next
    }

    companion object {
        const val TOKEN = "fresh-token"

        fun confirmed(token: String = TOKEN): Confirmation = Confirmation.Confirmed(FreshSignIn(token))
    }
}
