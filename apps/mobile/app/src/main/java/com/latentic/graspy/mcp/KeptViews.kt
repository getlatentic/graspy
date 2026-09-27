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
 * A view's document, kept to open with no connection. Its scripts, styles and fonts are its build's files, which
 * the service worker of [sandbox] holds. A page kept before pages named their sandbox has none, and is not opened.
 */
@Entity(tableName = "kept_views")
data class KeptViewEntity(
    @PrimaryKey val uri: String,
    val html: String,
    val title: String,
    val cspJson: String?,
    val permissionsJson: String?,
    val sandbox: String?,
)

@Dao
interface KeptViewDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun keep(view: KeptViewEntity)

    @Query("SELECT * FROM kept_views WHERE uri = :uri")
    suspend fun kept(uri: String): KeptViewEntity?

    @Query("SELECT DISTINCT sandbox FROM kept_views WHERE sandbox IS NOT NULL")
    suspend fun sandboxes(): List<String>
}

/**
 * Views as the web reads them (lib/mcp/server.ts uiView): from the server, else, when it could not be reached, the
 * page kept. A refusal is its answer, as it is for lessons. A page replaces its copy only once its sandbox's worker
 * holds every file of its build ([keeper]), so a copy never names files no worker holds, before a deploy or after.
 */
class OfflineViews(
    private val dao: KeptViewDao,
    private val read: suspend (String) -> UiView,
    private val keeper: SandboxKeeper,
) {
    private val keptThisRun = ConcurrentHashMap.newKeySet<String>()

    /** The view to show now. */
    suspend fun view(uri: String): UiView = try {
        read(uri)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        (if (failure.isUnreachable()) kept(uri) else null) ?: throw failure
    }

    /**
     * Keeps every view's page, while there is a connection, as readAllViews does: a sandbox kept once a run is not
     * asked again, and one no kept page needs any more is dropped as the next is kept.
     */
    suspend fun keepAll(uris: Collection<String>) {
        val fresh = uris.mapNotNull { uri -> bestEffort(TAG, "Reading the view $uri") { uri to read(uri) } }
        val sandboxes = fresh.map { (_, view) -> view.sandbox }.toSet()
        for (sandbox in sandboxes - keptThisRun) {
            val needed = (bestEffort(TAG, "Reading the kept sandboxes") { dao.sandboxes() }.orEmpty() + sandboxes).toSet()
            if (!keeper.keep(sandbox, needed)) continue
            val saved = fresh.filter { (_, view) -> view.sandbox == sandbox }.map { (uri, view) ->
                bestEffort(TAG, "Keeping the view $uri") { dao.keep(view.keptAs(uri)) } != null
            }
            if (saved.all { it }) keptThisRun += sandbox
        }
    }

    private suspend fun kept(uri: String): UiView? = bestEffort(TAG, "Reading the kept view $uri") { dao.kept(uri)?.toView() }

    private companion object {
        const val TAG = "GraspyViews"
    }
}

private fun UiView.keptAs(uri: String) = KeptViewEntity(uri, html, title, csp?.toString(), permissions?.toString(), sandbox)

private fun KeptViewEntity.toView(): UiView? =
    sandbox?.let { UiView(html, title, it, cspJson?.let(::jsonObjectOf), permissionsJson?.let(::jsonObjectOf)) }

private fun jsonObjectOf(text: String): JsonObject = mcpJson.parseToJsonElement(text).jsonObject
