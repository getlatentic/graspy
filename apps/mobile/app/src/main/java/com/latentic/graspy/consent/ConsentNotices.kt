package com.latentic.graspy.consent

/** The days a parent may choose for keeping a learner's voice recordings. */
val RETENTION_DAYS = listOf(30, 90, 365)

const val DEFAULT_RETENTION_DAYS = 30

/**
 * The notice a parent is shown before agreeing for graspy to teach a learner, word for word as docs/API.md has it. It
 * is English in every language of the app until it is translated.
 */
const val SERVICE_NOTICE =
    "graspy teaches this learner with their name, class, language, questions, answers and voice. " +
        "It sends them to Cloudflare, Amazon, Intron and Spitch to work. " +
        "You can delete this learner and everything graspy keeps about them at any time."

/** The notice for keeping a learner's voice recordings for [days], word for word as docs/API.md has it. */
fun recordingsNotice(days: Int): String =
    "graspy will keep this learner's voice recordings for $days days so you can listen to them and delete them. " +
        "They are sent to Intron and Cloudflare to check the answers. " +
        "You can delete any recording, or stop keeping them, at any time."
