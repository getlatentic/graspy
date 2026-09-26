package com.latentic.graspy.practice

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.ResponseBody
import retrofit2.HttpException
import retrofit2.Response

/** Where the teacher's recordings are kept on the phone, under the app's cache. */
const val TEACHER_AUDIO_DIRECTORY = "teacher-audio"

/** Her replies to one learner's answers are that learner's; the lines every learner hears are not. */
fun forgetReplies(directory: File) {
    directory.listFiles()?.filter { REPLY_CLIP.containsMatchIn(it.name) }?.forEach(File::delete)
}

/** A reply is kept as `<language>-reply-<sample>.audio`, beside its version and any download in progress. */
private val REPLY_CLIP = Regex("^[a-z]+-reply-")

/**
 * The teacher's recordings kept on the phone, each checked with the server once per app session.
 *
 * A published line is stored with the version the server gave it: its ETag, a hash of the exact words
 * and voice. The first time a session needs such a line, the phone asks whether its copy is still
 * current. A 304 keeps the file and a 200 replaces it, so a rewritten line is heard with its new words.
 * A line already on the phone still plays when the server cannot be reached, and is checked again next
 * time. Her reply to one answer cannot be rewritten, so it is fetched once and then simply played.
 */
class TeacherAudioCache(
    private val directory: File,
    private val fetch: suspend (line: TeacherLine, language: String, heldVersion: String?) -> Response<ResponseBody>,
) {
    // One lock per line, so different lines download side by side while one line never downloads twice.
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val checked: MutableSet<String> = ConcurrentHashMap.newKeySet()

    suspend fun prepare(line: TeacherLine, language: String): File = withContext(Dispatchers.IO) {
        directory.mkdirs()
        val audio = File(directory, "$language-${line.fileName}.audio")
        val version = File(directory, "${audio.name}.etag")
        locks.getOrPut(audio.name) { Mutex() }.withLock {
            if (audio.isPlayable() && (!line.rewritable || audio.name in checked)) return@withLock
            val held = version.takeIf { audio.isPlayable() && it.isFile }?.readText()
            val response = try {
                fetch(line, language, held)
            } catch (offline: IOException) {
                if (audio.isPlayable()) return@withLock
                throw offline
            }
            when {
                response.code() == NOT_MODIFIED && held != null -> Unit
                response.isSuccessful -> keep(requireNotNull(response.body()), response.headers()["ETag"], audio, version)
                else -> throw HttpException(response)
            }
            checked += audio.name
        }
        audio
    }

    private fun keep(body: ResponseBody, etag: String?, audio: File, version: File) {
        val temporary = File.createTempFile(audio.name, ".download", directory)
        try {
            body.use { it.byteStream().use { input -> temporary.outputStream().use(input::copyTo) } }
            check(temporary.length() > 0) { "The teacher voice service returned empty audio" }
            // One atomic move: the old clip stays playable until the new one has fully replaced it.
            Files.move(temporary.toPath(), audio.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } finally {
            temporary.delete()
        }
        // A server that gives no version gets asked again in full next session.
        if (etag != null) version.writeText(etag) else version.delete()
    }

    private fun File.isPlayable() = isFile && length() > 0

    private companion object {
        const val NOT_MODIFIED = 304
    }
}
