package com.latentic.graspy.mcp

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query

/** A view's tools/call the server did not take, kept to send in order later. */
@Entity(tableName = "kept_view_calls")
data class KeptCallEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val ownerId: String,
    val name: String,
    val argumentsJson: String,
    val keptAt: Long,
)

@Dao
interface KeptCallDao {
    @Insert
    suspend fun keep(call: KeptCallEntity)

    @Query("SELECT * FROM kept_view_calls WHERE ownerId = :ownerId ORDER BY id")
    suspend fun kept(ownerId: String): List<KeptCallEntity>

    @Query("DELETE FROM kept_view_calls WHERE id = :id")
    suspend fun forget(id: Long)
}
