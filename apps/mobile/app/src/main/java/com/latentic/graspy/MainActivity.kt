package com.latentic.graspy

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.latentic.graspy.ui.GraspyApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // The theme's window shows the splash mark while the app starts; once it draws, the plain surface.
        window.setBackgroundDrawableResource(R.color.graspy_canvas)
        setContent { GraspyApp() }
    }
}
