package com.latentic.graspy.lesson

import com.latentic.graspy.mcp.ViewCard
import com.latentic.graspy.mcp.ViewServer
import com.latentic.graspy.plan.LessonTarget
import kotlinx.serialization.json.JsonObject

/** A lesson's view: its lesson tools answer from the phone's copy while offline, its other calls as any view's. */
class LessonViewServer(
    private val views: ViewServer,
    private val lessons: OfflineLessons,
    private val target: LessonTarget,
    private val card: ViewCard,
) : ViewServer by views {
    override suspend fun call(name: String, arguments: JsonObject): JsonObject =
        if (isLessonTool(name)) lessons.toolOrCopy(target, card, name, arguments) else views.call(name, arguments)
}
