package com.latentic.graspy.localization

import java.util.Locale

/**
 * A copy template filled with Western digits in every language, as the web writes numbers. The phone's
 * own locale would write Arabic-Indic digits on an Arabic phone.
 */
fun String.fillWith(vararg values: Any?): String = String.format(Locale.ROOT, this, *values)

/** A web template filled by name, as the web's t("…", { total }) fills it; numbers keep Western digits. */
fun String.filled(vararg values: Pair<String, Any>): String =
    values.fold(this) { text, (key, value) -> text.replace("{$key}", value.toString()) }
