package com.latentic.graspy.auth

import android.content.Context
import android.util.Log
import androidx.core.content.edit

/**
 * Firebase keeps what Google's page returns to a graspy that Android stopped behind it, and signs it in by itself
 * when Firebase Auth is next built. The start that return causes has built it already, so the sign-in would land at
 * a later start, unasked, and in place of the account on the device if there is one. Dropped before Firebase Auth
 * is built: the parent signs in again.
 */
fun dropStoredBrowserSignIn(context: Context) {
    val stored = context.getSharedPreferences(FIREBASE_STORED_SIGN_IN, Context.MODE_PRIVATE)
    if (stored.all.isEmpty()) return
    Log.w("GraspySignIn", "Dropped a sign-in Google's page returned after graspy was stopped")
    stored.edit { clear() }
}

internal const val FIREBASE_STORED_SIGN_IN = "com.google.firebase.auth.internal.ProcessDeathHelper"
