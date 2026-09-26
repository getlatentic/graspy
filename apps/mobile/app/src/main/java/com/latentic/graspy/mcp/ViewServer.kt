package com.latentic.graspy.mcp

import kotlinx.serialization.json.JsonObject

/** Where views and their tools come from, as the learner reaches them. */
interface ViewServer {
    suspend fun view(uri: String): UiView

    /** A view's own call; kept to send later while the server cannot be reached. */
    suspend fun call(name: String, arguments: JsonObject): JsonObject

    suspend fun openToolView(name: String, arguments: JsonObject): ViewCard
}
