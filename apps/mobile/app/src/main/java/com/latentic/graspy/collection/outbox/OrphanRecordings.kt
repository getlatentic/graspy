package com.latentic.graspy.collection.outbox

import java.io.File

/**
 * Deletes the recordings in [directory] that no submission holds and that were last written before this
 * process started at [startedAt]: the takes of a process that died while the child spoke. A recording
 * written since may be a take in progress, so it stays.
 */
suspend fun sweepOrphanRecordings(dao: SubmissionDao, directory: File, startedAt: Long) {
    val held = dao.audioPaths().mapTo(HashSet()) { File(it).absolutePath }
    // A file's time may be kept to the whole second, so a take begun in the second the process
    // started must not read as older than it.
    val before = startedAt - startedAt % 1_000
    directory.listFiles()
        ?.filter { it.isFile && it.absolutePath !in held && it.lastModified() < before }
        ?.forEach { it.delete() }
}
