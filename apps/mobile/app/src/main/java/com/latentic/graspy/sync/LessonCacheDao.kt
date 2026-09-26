package com.latentic.graspy.sync

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

/** Each learner's own copy of the catalogue and of the step they were last given, under their learner key. */
@Dao
interface LessonCacheDao {
    @Query(
        """SELECT * FROM catalogue_lessons
           WHERE ownerId = :ownerId AND learnerClass = :learnerClass
           ORDER BY position""",
    )
    fun observeCatalogue(ownerId: String, learnerClass: String): Flow<List<CatalogueLessonEntity>>

    @Query("SELECT * FROM lesson_moves WHERE ownerId = :ownerId AND learnerClass = :learnerClass")
    fun observeLessonMove(ownerId: String, learnerClass: String): Flow<LessonMoveEntity?>

    @Query("DELETE FROM catalogue_lessons WHERE ownerId = :ownerId AND learnerClass = :learnerClass")
    suspend fun deleteCatalogue(ownerId: String, learnerClass: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCatalogue(lessons: List<CatalogueLessonEntity>)

    /** A reply is the whole catalogue for that class, so it replaces the stored one outright. */
    @Transaction
    suspend fun replaceCatalogue(
        ownerId: String,
        learnerClass: String,
        lessons: List<CatalogueLessonEntity>,
    ) {
        deleteCatalogue(ownerId, learnerClass)
        insertCatalogue(lessons)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveLessonMove(move: LessonMoveEntity)

    @Query(
        """SELECT EXISTS(SELECT 1 FROM catalogue_lessons WHERE ownerId = :ownerId)
           OR EXISTS(SELECT 1 FROM lesson_moves WHERE ownerId = :ownerId)""",
    )
    suspend fun holdsAny(ownerId: String): Boolean

    @Query("UPDATE OR REPLACE catalogue_lessons SET ownerId = :learnerKey WHERE ownerId = :uid")
    suspend fun claimCatalogue(uid: String, learnerKey: String)

    @Query("UPDATE OR REPLACE lesson_moves SET ownerId = :learnerKey WHERE ownerId = :uid")
    suspend fun claimLessonMoves(uid: String, learnerKey: String)

    @Query("DELETE FROM catalogue_lessons WHERE ownerId != :ownerId")
    suspend fun keepCatalogueOf(ownerId: String)

    @Query("DELETE FROM lesson_moves WHERE ownerId != :ownerId")
    suspend fun keepLessonMovesOf(ownerId: String)

    /** The copies an account kept before it held learners become the learner's; any other account's go. */
    @Transaction
    suspend fun claim(uid: String, learnerKey: String) {
        claimCatalogue(uid, learnerKey)
        claimLessonMoves(uid, learnerKey)
        keepCatalogueOf(learnerKey)
        keepLessonMovesOf(learnerKey)
    }
}
