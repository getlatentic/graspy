package com.latentic.graspy.localization

import android.content.Context
import androidx.core.content.edit
import com.latentic.graspy.account.PreferenceFiles

/** Nigerian school classes graspy teaches; the wire value travels with every sample. */
enum class SchoolClass(val wireValue: String, val primary: Boolean) {
    NURSERY_1("nursery_1", true),
    NURSERY_2("nursery_2", true),
    KINDERGARTEN("kindergarten", true),
    PRIMARY_1("primary_1", true),
    PRIMARY_2("primary_2", true),
    PRIMARY_3("primary_3", true),
    PRIMARY_4("primary_4", true),
    PRIMARY_5("primary_5", true),
    PRIMARY_6("primary_6", true),
    JSS_1("jss_1", false),
    JSS_2("jss_2", false),
    JSS_3("jss_3", false),
    ;

    companion object {
        fun fromWire(value: String?): SchoolClass? = entries.firstOrNull { it.wireValue == value }
    }
}

/** Asked when a learner first learns on this device: class, then language. Changed from the account menu. */
data class LearnerProfile(
    val schoolClass: SchoolClass,
    val language: AppLanguageSelection,
)

/**
 * Each learner's class and language, and whether they have seen the voice note, kept on this device
 * under their learner key. They stay when
 * the device takes another learner, so switching back restores them; signing out removes them all.
 */
class LearnerProfileStore(context: Context) {
    private val preferences = context.getSharedPreferences(PreferenceFiles.PROFILES, 0)
    private val deviceLanguage = context.getSharedPreferences(PreferenceFiles.DEVICE_LANGUAGE, 0)

    fun load(learnerKey: String): LearnerProfile? {
        val schoolClass = SchoolClass.fromWire(learnerClass(learnerKey)) ?: return null
        val language = preferences.getString(languageKey(learnerKey), null)
        return LearnerProfile(schoolClass, AppLanguageSelection.fromStored(language))
    }

    fun save(learnerKey: String, profile: LearnerProfile) {
        preferences.edit {
            putString(classKey(learnerKey), profile.schoolClass.wireValue)
            putString(languageKey(learnerKey), profile.language.storedValue)
        }
    }

    fun learnerClass(learnerKey: String): String? = preferences.getString(classKey(learnerKey), null)

    /** Whether the learner has been told that graspy sends their voice to check their answers. */
    fun voiceNoteSeen(learnerKey: String): Boolean = preferences.getBoolean(voiceNoteKey(learnerKey), false)

    fun seeVoiceNote(learnerKey: String) = preferences.edit { putBoolean(voiceNoteKey(learnerKey), true) }

    fun forget(learnerKey: String) {
        preferences.edit {
            remove(classKey(learnerKey))
            remove(languageKey(learnerKey))
            remove(voiceNoteKey(learnerKey))
        }
    }

    fun forgetAll() {
        preferences.edit(commit = true) { clear() }
        deviceLanguage.edit(commit = true) { clear() }
    }

    /** The class and language chosen before accounts held learners: the device's own. */
    fun holdsDeviceProfile(): Boolean = preferences.contains(DEVICE_CLASS)

    /** The first learner chosen takes the device's own profile, unless they already have one here. */
    fun claimDeviceProfile(learnerKey: String) {
        val schoolClass = SchoolClass.fromWire(preferences.getString(DEVICE_CLASS, null))
        if (schoolClass != null && load(learnerKey) == null) {
            val language = AppLanguageSelection.fromStored(deviceLanguage.getString(DEVICE_LANGUAGE, null))
            save(learnerKey, LearnerProfile(schoolClass, language))
        }
        preferences.edit { remove(DEVICE_CLASS) }
        deviceLanguage.edit { clear() }
    }

    private fun classKey(learnerKey: String) = "$learnerKey/$CLASS"

    private fun languageKey(learnerKey: String) = "$learnerKey/$LANGUAGE"

    private fun voiceNoteKey(learnerKey: String) = "$learnerKey/$VOICE_NOTE"

    private companion object {
        const val CLASS = "school_class"
        const val LANGUAGE = "language"
        const val VOICE_NOTE = "voice_note_seen"
        const val DEVICE_CLASS = "school_class"
        const val DEVICE_LANGUAGE = "app_language"
    }
}
