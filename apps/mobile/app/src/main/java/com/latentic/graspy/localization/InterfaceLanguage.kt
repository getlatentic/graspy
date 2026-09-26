package com.latentic.graspy.localization

import android.content.Context
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.content.edit
import com.latentic.graspy.account.PreferenceFiles
import java.util.Locale

/**
 * The language of the app's words. The teacher speaks only English, Yorùbá and Pidgin, since that is
 * all the lesson audio there is, so Arabic is an interface language alone and a lesson's own words stay
 * in the lesson language.
 */
enum class InterfaceLanguage(val tag: String, val nativeName: String, val layoutDirection: LayoutDirection) {
    ENGLISH("en", "English", LayoutDirection.Ltr),
    YORUBA("yo", "Yorùbá", LayoutDirection.Ltr),
    PIDGIN("pcm", "Pidgin", LayoutDirection.Ltr),
    ARABIC("ar", "العربية", LayoutDirection.Rtl),
    ;

    companion object {
        fun fromTag(tag: String?): InterfaceLanguage? = entries.firstOrNull { it.tag == tag }
    }
}

/**
 * The language chosen for the app's words; else the learner's lesson language, as the web's words follow
 * the learner's; else, before there is a learner, the phone's own when graspy has it; else English.
 */
fun resolveInterfaceLanguage(
    chosen: InterfaceLanguage?,
    lessons: AppLanguage?,
    phoneLanguageTag: String,
): InterfaceLanguage =
    chosen ?: lessons?.let(::wordsFor)
        ?: InterfaceLanguage.fromTag(Locale.forLanguageTag(phoneLanguageTag).language)
        ?: InterfaceLanguage.ENGLISH

private fun wordsFor(lessons: AppLanguage): InterfaceLanguage = when (lessons) {
    AppLanguage.ENGLISH -> InterfaceLanguage.ENGLISH
    AppLanguage.YORUBA -> InterfaceLanguage.YORUBA
    AppLanguage.PIDGIN -> InterfaceLanguage.PIDGIN
}

/** Chosen for the phone rather than for a learner, as the web keeps it for the browser: signing out keeps it. */
class InterfaceLanguageStore(context: Context) {
    private val preferences = context.getSharedPreferences(PreferenceFiles.INTERFACE, 0)

    /** Null follows the phone's language. */
    fun chosen(): InterfaceLanguage? = InterfaceLanguage.fromTag(preferences.getString(KEY, null))

    fun choose(language: InterfaceLanguage?) = preferences.edit { putString(KEY, language?.tag) }

    private companion object {
        const val KEY = "interface_language"
    }
}
