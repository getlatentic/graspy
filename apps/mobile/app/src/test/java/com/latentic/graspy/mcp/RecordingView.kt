package com.latentic.graspy.mcp

import android.content.Context
import android.view.MotionEvent
import android.view.View

/** Stands in for a view's WebView: records every event that reaches it, past any listener. */
class RecordingView(context: Context) : View(context) {
    val touches = mutableListOf<Int>()
    val generic = mutableListOf<Int>()
    val hovers = mutableListOf<Int>()

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked != MotionEvent.ACTION_CANCEL) touches += event.actionMasked
        return true
    }

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        generic += event.actionMasked
        return true
    }

    override fun onHoverEvent(event: MotionEvent): Boolean {
        hovers += event.actionMasked
        return true
    }
}
