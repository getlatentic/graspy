package com.latentic.graspy.mcp

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** What the host page may tell the app. */
sealed interface HostMessage {
    /** The page has loaded and can frame a view. */
    data object Ready : HostMessage

    /** A message from the sandbox proxy, passed on unread. */
    data class Relay(val data: JsonElement) : HostMessage
}

/**
 * Lets a message through only from graspy's own host page, in the WebView's main frame, relaying a frame
 * on the API's origin. A view, the proxy or any page they navigate to has no way to reach the app itself.
 */
class HostGate(private val hostOrigin: String, private val viewOrigin: String) {
    fun admit(sourceOrigin: String, isMainFrame: Boolean, message: String?): HostMessage? {
        if (!isMainFrame || sourceOrigin.trimEnd('/') != hostOrigin || message == null) return null
        val body = runCatching { mcpJson.parseToJsonElement(message) as? JsonObject }.getOrNull() ?: return null
        return when (body.string("kind")) {
            "ready" -> HostMessage.Ready
            "relay" -> body["data"]?.takeIf { body.string("origin") == viewOrigin }?.let(HostMessage::Relay)
            else -> null
        }
    }
}
