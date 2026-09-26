package com.latentic.graspy.collection.outbox

import android.content.Context
import androidx.room.Room
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import java.io.File
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** A phone on the last version keeps what it holds, and Room finds the tables it expects. */
@RunWith(RobolectricTestRunner::class)
class GraspyMigrationTest {
    private val context: Context = RuntimeEnvironment.getApplication()

    @After
    fun forget() {
        context.deleteDatabase(NAME)
    }

    @Test
    fun `version 13 moves to 14 with its kept calls, and lessons and views to copy`() = runBlocking {
        createAt(13) { db ->
            db.execSQL(
                "INSERT INTO kept_view_calls (ownerId, name, argumentsJson, keptAt) VALUES ('uid/ada', 'answer_practice', '{}', 1)",
            )
        }

        val database = Room.databaseBuilder(context, GraspyDatabase::class.java, NAME)
            .addMigrations(*graspyMigrations)
            .allowMainThreadQueries()
            .build()
        try {
            assertEquals(listOf("answer_practice"), database.keptCallDao().kept("uid/ada").map { it.name })
            assertEquals(emptyList<Any>(), database.lessonCopyDao().copied("uid/ada"))
            assertNull(database.keptViewDao().kept("ui://graspy/lesson"))
        } finally {
            database.close()
        }
    }

    /** The database as Room wrote it at [version], from the schema it exported then. */
    private fun createAt(version: Int, fill: (SupportSQLiteDatabase) -> Unit) {
        val schema = Json.parseToJsonElement(File(SCHEMAS, "$version.json").readText()).jsonObject.getValue("database").jsonObject
        val callback = object : SupportSQLiteOpenHelper.Callback(version) {
            override fun onCreate(db: SupportSQLiteDatabase) = creation(schema).forEach(db::execSQL)

            override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
        }
        val configuration = SupportSQLiteOpenHelper.Configuration.builder(context).name(NAME).callback(callback).build()
        FrameworkSQLiteOpenHelperFactory().create(configuration).use { helper -> fill(helper.writableDatabase) }
    }

    private fun creation(schema: JsonObject): List<String> {
        val tables = schema.getValue("entities").jsonArray.map { it.jsonObject }.flatMap { entity ->
            val table = entity.getValue("tableName").jsonPrimitive.content
            val indices = entity["indices"]?.jsonArray.orEmpty().mapNotNull { it.jsonObject["createSql"]?.jsonPrimitive?.contentOrNull }
            (listOf(entity.getValue("createSql").jsonPrimitive.content) + indices).map { it.replace("\${TABLE_NAME}", table) }
        }
        return tables + schema.getValue("setupQueries").jsonArray.map { it.jsonPrimitive.content }
    }

    private companion object {
        const val NAME = "migration-test.db"
        val SCHEMAS = File("schemas/com.latentic.graspy.collection.outbox.GraspyDatabase")
    }
}
