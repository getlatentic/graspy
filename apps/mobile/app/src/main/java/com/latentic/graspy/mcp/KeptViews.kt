package com.latentic.graspy.mcp

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * A view's document as it was last shown. Its scripts, styles and fonts are hashed files the sandbox's
 * service worker keeps once a page has loaded them, so with this the view opens with no connection.
 */
@Entity(tableName = "kept_views")
data class KeptViewEntity(
    @PrimaryKey val uri: String,
    val html: String,
    val title: String,
    val cspJson: String?,
    val permissionsJson: String?,
)

@Dao
interface KeptViewDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun keep(view: KeptViewEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun keepIfNone(view: KeptViewEntity)

    @Query("SELECT * FROM kept_views WHERE uri = :uri")
    suspend fun kept(uri: String): KeptViewEntity?
}

/**
 * Views as the web reads them (lib/mcp/server.ts uiView): from the server, else, when it could not be
 * reached, the copy last shown. A refusal is its answer, as it is for lessons. Only a view being shown
 * replaces its copy: the page it replaces had its files cached by showing, and a newer page's files may
 * not be until it is shown too.
 */
class OfflineViews(private val dao: KeptViewDao, private val read: suspend (String) -> UiView) {
    private val keptThisRun = ConcurrentHashMap.newKeySet<String>()

    /** The view to show now; read from the server, it replaces the copy. */
    suspend fun view(uri: String): UiView {
        val view = try {
            read(uri)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            return (if (failure.isUnreachable()) kept(uri) else null) ?: throw failure
        }
        keep(uri, view)
        return view
    }

    /** Keeps each view that has no copy yet, while there is a connection, as readAllViews does; a copy is left as it is. */
    suspend fun keepAll(uris: Collection<String>) {
        uris.forEach { uri -> bestEffort(TAG, "Keeping the view $uri") { dao.keepIfNone(read(uri).keptAs(uri)) } }
    }

    private suspend fun keep(uri: String, view: UiView) {
        if (uri in keptThisRun) return
        bestEffort(TAG, "Keeping the view $uri") { dao.keep(view.keptAs(uri)) } ?: return
        keptThisRun += uri
    }

    private suspend fun kept(uri: String): UiView? = bestEffort(TAG, "Reading the kept view $uri") { dao.kept(uri)?.toView() }

    private companion object {
        const val TAG = "GraspyViews"
    }
}

private fun UiView.keptAs(uri: String) = KeptViewEntity(uri, html, title, csp?.toString(), permissions?.toString())

private fun KeptViewEntity.toView() = UiView(html, title, cspJson?.let(::jsonObjectOf), permissionsJson?.let(::jsonObjectOf))

private fun jsonObjectOf(text: String): JsonObject = mcpJson.parseToJsonElement(text).jsonObject
