package com.latentic.graspy.account

import android.content.SharedPreferences
import androidx.core.content.edit
import java.util.UUID

/**
 * The id graspy knows this device by. It is random, and a new one is taken on signing out, so the
 * next account to sign in here cannot take this one's record.
 */
class DeviceIdStore(private val preferences: SharedPreferences) {
    fun current(): String = preferences.getString(KEY, null)?.takeIf(ACCEPTED::matches) ?: renew()

    fun renew(): String = UUID.randomUUID().toString().also { preferences.edit(commit = true) { putString(KEY, it) } }

    private companion object {
        const val KEY = "device_id"

        /** What the server accepts as a device id. */
        val ACCEPTED = Regex("^[A-Za-z0-9_-]{8,64}$")
    }
}
