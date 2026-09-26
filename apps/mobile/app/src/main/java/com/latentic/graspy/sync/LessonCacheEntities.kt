package com.latentic.graspy.sync

import androidx.room.Entity
import com.latentic.graspy.collection.LessonMoveDto
import com.latentic.graspy.collection.outbox.apiJson
import com.latentic.graspy.home.CatalogueDto
import com.latentic.graspy.home.CatalogueLesson
import com.latentic.graspy.home.CatalogueLessonDto
import com.latentic.graspy.home.toLesson
import com.latentic.graspy.localization.AppLanguage
import com.latentic.graspy.practice.LessonMove
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

/** One lesson of the learner's class as the Worker last sent it, so Home opens without waiting. */
@Entity(tableName = "catalogue_lessons", primaryKeys = ["ownerId", "learnerClass", "planId"])
data class CatalogueLessonEntity(
    val ownerId: String,
    val learnerClass: String,
    val planId: String,
    val position: Int,
    val subject: String,
    val topic: String,
    val titleJson: String,
    val standing: String,
    val daysCorrect: Int,
    val current: Boolean,
    val day: String,
    val fetchedAtEpochMillis: Long,
)

/** The step the Worker last issued this learner, so the lesson opens without waiting. */
@Entity(tableName = "lesson_moves", primaryKeys = ["ownerId", "learnerClass"])
data class LessonMoveEntity(
    val ownerId: String,
    val learnerClass: String,
    val moveJson: String,
    val revision: Long,
    val day: String,
    val fetchedAtEpochMillis: Long,
)

private val titleSerializer = MapSerializer(String.serializer(), String.serializer())

/** Titles are stored in every language, so changing language never needs the network. */
fun CatalogueDto.toStoredLessons(
    ownerId: String,
    learnerClass: String,
    fetchedAtEpochMillis: Long,
): List<CatalogueLessonEntity> = lessons.mapIndexed { position, lesson ->
    CatalogueLessonEntity(
        ownerId = ownerId,
        learnerClass = learnerClass,
        planId = lesson.planId,
        position = position,
        subject = lesson.subject,
        topic = lesson.topic,
        titleJson = apiJson.encodeToString(titleSerializer, lesson.title),
        standing = lesson.standing,
        daysCorrect = lesson.daysCorrect,
        current = lesson.current,
        day = day,
        fetchedAtEpochMillis = fetchedAtEpochMillis,
    )
}

fun CatalogueLessonEntity.toLesson(language: AppLanguage): CatalogueLesson = CatalogueLessonDto(
    planId = planId,
    subject = subject,
    topic = topic,
    title = apiJson.decodeFromString(titleSerializer, titleJson),
    standing = standing,
    daysCorrect = daysCorrect,
    current = current,
).toLesson(language)

fun LessonMoveDto.toStoredMove(
    ownerId: String,
    learnerClass: String,
    fetchedAtEpochMillis: Long,
): LessonMoveEntity = LessonMoveEntity(
    ownerId = ownerId,
    learnerClass = learnerClass,
    moveJson = apiJson.encodeToString(LessonMove.serializer(), move),
    revision = revision,
    day = day,
    fetchedAtEpochMillis = fetchedAtEpochMillis,
)

fun LessonMoveEntity.move(): LessonMove = apiJson.decodeFromString(LessonMove.serializer(), moveJson)
