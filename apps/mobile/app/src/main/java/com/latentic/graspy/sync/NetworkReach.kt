package com.latentic.graspy.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Whether the phone has a link to the internet. Screens read stored lessons whatever this says; it
 * only lets a learner with nothing stored yet be told why there is nothing to show.
 */
fun networkReach(context: Context): Flow<Boolean> = callbackFlow {
    val manager = requireNotNull(context.getSystemService(ConnectivityManager::class.java))
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            trySend(true)
        }

        override fun onLost(network: Network) {
            trySend(false)
        }

        override fun onUnavailable() {
            trySend(false)
        }
    }
    trySend(manager.activeNetwork != null)
    manager.registerDefaultNetworkCallback(callback)
    awaitClose { manager.unregisterNetworkCallback(callback) }
}.distinctUntilChanged()
