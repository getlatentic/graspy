package com.latentic.graspy.subjects

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import com.latentic.graspy.ui.AgeBand
import com.latentic.graspy.ui.icons.rememberLucide
import com.latentic.graspy.ui.space

/** The subject's learner picture, or its icon on a tinted ground; the caller sizes and clips it. */
@Composable
fun SubjectPicture(name: String, band: AgeBand, modifier: Modifier = Modifier, iconSize: Dp = space(8)) {
    val tint = subjectTint(name)
    val art = remember(name) { SubjectArt.of(name) }
    Box(modifier.background(tint.ground), contentAlignment = Alignment.Center) {
        if (art != null) {
            Image(painterResource(art.drawable(band)), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Icon(rememberLucide(subjectIcon(name)), contentDescription = null, tint = tint.ink, modifier = Modifier.size(iconSize))
        }
    }
}
