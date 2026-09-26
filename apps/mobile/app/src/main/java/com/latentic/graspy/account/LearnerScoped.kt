package com.latentic.graspy.account

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory

/** The learner a scope's view models belong to, carried in their creation extras. */
val LEARNER_KEY = object : CreationExtras.Key<String> {}

/**
 * A view model of one learner, made with the learner of the scope it lives in. The device's learner can go
 * at any moment (forgotten on another device), before the screens that belong to them leave; a view model
 * bound when it is made keeps working for its own learner instead of finding none.
 */
inline fun <reified VM : ViewModel> learnerViewModelFactory(crossinline create: (Application, String) -> VM): ViewModelProvider.Factory =
    viewModelFactory {
        initializer {
            val learnerKey = requireNotNull(this[LEARNER_KEY]) { "${VM::class.simpleName} belongs to a learner: make it inside a LearnerScope" }
            create(requireNotNull(this[APPLICATION_KEY]), learnerKey)
        }
    }
