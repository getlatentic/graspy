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
 * A view's document as the server last gave it. Its scripts, styles and fonts are files the sandbox's
 * service worker keeps, so with this the view opens with no connection.
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

    @Query("SELECT * FROM kept_views WHERE uri = :uri")
    suspend fun kept(uri: String): KeptViewEntity?
}

/** Views as the web reads them (lib/mcp/server.ts uiView): from the server, else the copy last read. */
class OfflineViews(private val dao: KeptViewDao, private val read: suspend (String) -> UiView) {
    private val keptThisRun = ConcurrentHashMap.newKeySet<String>()

    suspend fun view(uri: String): UiView = try {
        read(uri).also { if (keptThisRun.add(uri)) dao.keep(it.keptAs(uri)) }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        dao.kept(uri)?.toView() ?: throw failure
    }
}

private fun UiView.keptAs(uri: String) = KeptViewEntity(uri, html, title, csp?.toString(), permissions?.toString())

private fun KeptViewEntity.toView() = UiView(html, title, cspJson?.let(::jsonObjectOf), permissionsJson?.let(::jsonObjectOf))

private fun jsonObjectOf(text: String): JsonObject = mcpJson.parseToJsonElement(text).jsonObject
