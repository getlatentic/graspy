package com.latentic.graspy.ui

import androidx.lifecycle.ViewModel
import com.latentic.graspy.ask.AskViewModel
import java.io.File
import java.lang.reflect.Modifier
import java.util.jar.JarFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Every view model the default factory cannot make is on the list, so no screen of a learner's crashes opening. */
class LearnerViewModelsListTest {
    /** The app's compiled classes, from the jar or folder the build puts them in for unit tests. */
    private val appClasses: List<Class<*>> by lazy {
        val location = File(AskViewModel::class.java.protectionDomain.codeSource.location.toURI())
        val paths = if (location.isDirectory) {
            location.walk().filter { it.isFile }.map { it.relativeTo(location).invariantSeparatorsPath }.toList()
        } else {
            JarFile(location).use { jar -> jar.entries().asSequence().map { it.name }.toList() }
        }
        paths.filter { it.startsWith("com/latentic/graspy/") && it.endsWith(".class") }
            .map { Class.forName(it.removeSuffix(".class").replace('/', '.'), false, javaClass.classLoader) }
    }

    private val viewModels by lazy {
        appClasses.filter { ViewModel::class.java.isAssignableFrom(it) && !Modifier.isAbstract(it.modifiers) }
    }

    @Test
    fun `the app's view models are all found`() {
        assertTrue(viewModels.containsAll(LEARNER_VIEW_MODELS.keys))
    }

    @Test
    fun `every view model that needs more than the application is on the list`() {
        val unlisted = viewModels.filterNot { it in LEARNER_VIEW_MODELS || madeWithoutALearner(it) }
        assertEquals(emptyList<String>(), unlisted.map { it.name })
    }
}
