package com.latentic.graspy.collection

import android.content.Context
import androidx.core.content.edit
import com.latentic.graspy.account.PreferenceFiles

class RecordingConsentStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PreferenceFiles.CONSENT, 0)

    val isGranted: Boolean
        get() = preferences.getBoolean(GRANTED, false)

    fun grant() {
        preferences.edit { putBoolean(GRANTED, true) }
    }

    private companion object {
        const val GRANTED = "hackathon_evaluation_granted"
    }
}
