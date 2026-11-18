package com.dactor.clinic.data.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.dactor.clinic.ui.components.isInternetAvailable
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
open class NetworkMonitor(
    private val context: Context?,
    private val isTest: Boolean = false
) {
    @Inject
    constructor(@ApplicationContext context: Context) : this(context, false)

    constructor() : this(null, true)

    open fun isOnline(): Boolean = if (context != null) isInternetAvailable(context) else true

    open fun isOnlineFlow(): Flow<Boolean> = callbackFlow {
        if (context == null) {
            trySend(true)
            close()
            return@callbackFlow
        }

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (cm == null) {
            trySend(true)
            close()
            return@callbackFlow
        }

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(true)
            }
            override fun onLost(network: Network) {
                trySend(isInternetAvailable(context))
            }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                val hasNet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                trySend(hasNet)
            }
        }

        trySend(isInternetAvailable(context))
        try {
            cm.registerDefaultNetworkCallback(callback)
        } catch (_: Exception) {
            trySend(true)
        }

        awaitClose {
            try {
                cm.unregisterNetworkCallback(callback)
            } catch (_: Exception) {}
        }
    }.distinctUntilChanged()
}
