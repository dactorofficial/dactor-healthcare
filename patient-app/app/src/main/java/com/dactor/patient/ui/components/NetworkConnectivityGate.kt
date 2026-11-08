package com.dactor.patient.ui.components

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.delay

fun isInternetAvailable(context: Context): Boolean {
    return try {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true

        // 1. Check active default network capabilities & transports
        val activeNetwork = cm.activeNetwork
        if (activeNetwork != null) {
            val caps = cm.getNetworkCapabilities(activeNetwork)
            if (caps != null && (
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            )) {
                return true
            }
        }

        // 2. Fallback check across all available networks
        val allNetworks = cm.allNetworks
        for (net in allNetworks) {
            val caps = cm.getNetworkCapabilities(net)
            if (caps != null && (
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            )) {
                return true
            }
        }

        // 3. Fallback to activeNetworkInfo (deprecated but resilient on OEM Android builds)
        @Suppress("DEPRECATION")
        val netInfo = cm.activeNetworkInfo
        if (netInfo != null && (netInfo.isConnectedOrConnecting || netInfo.isConnected)) {
            return true
        }

        false
    } catch (e: Exception) {
        // Never block the user if connectivity check throws an exception
        true
    }
}

fun openInternetSettings(context: Context) {
    try {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY)
        } else {
            Intent(Settings.ACTION_WIFI_SETTINGS)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    } catch (e: Exception) {
        try {
            val fallback = Intent(Settings.ACTION_WIRELESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(fallback)
        } catch (ignored: Exception) {}
    }
}

@Composable
fun NetworkConnectivityGate(
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val initialConnected = remember { isInternetAvailable(context) }
    var isConnected by remember { mutableStateOf(initialConnected) }
    // Optimistic startup: always let the app render without blocking users on launch
    var hasPassedInitialSetup by remember { mutableStateOf(true) }

    // Real-time ConnectivityManager default network callback
    DisposableEffect(context) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                isConnected = true
                hasPassedInitialSetup = true
            }

            override fun onLost(network: Network) {
                // Only mark disconnected if no other active/fallback network exists
                isConnected = isInternetAvailable(context)
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                val hasNet = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                if (hasNet) {
                    isConnected = true
                    hasPassedInitialSetup = true
                }
            }
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                cm?.registerDefaultNetworkCallback(callback)
            } else {
                val request = NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
                cm?.registerNetworkCallback(request, callback)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        onDispose {
            try {
                cm?.unregisterNetworkCallback(callback)
            } catch (ignored: Exception) {}
        }
    }

    // Re-check whenever user returns from background or Settings panel
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                val nowOnline = isInternetAvailable(context)
                if (nowOnline) {
                    isConnected = true
                    hasPassedInitialSetup = true
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    // Periodic lightweight poll with consecutive failure debounce to prevent false flickers
    var consecutiveOfflineCount by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(3000L)
            val nowOnline = isInternetAvailable(context)
            if (nowOnline) {
                consecutiveOfflineCount = 0
                isConnected = true
            } else {
                consecutiveOfflineCount++
                // Require 4 consecutive failures (~12-15s) before declaring connection lost
                if (consecutiveOfflineCount >= 4) {
                    isConnected = false
                }
            }
        }
    }
        // 2. Respective page is active; if internet goes away while doing something, show message that no internet connection
        Box(modifier = Modifier.fillMaxSize()) {
            content()

            AnimatedVisibility(
                visible = !isConnected,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
            ) {
                Surface(
                    color = Color(0xFFDC2626),
                    shadowElevation = 8.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.WifiOff,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                            Column {
                                Text(
                                    text = "No Internet Connection",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp
                                )
                                Text(
                                    text = "Connection lost. Please check your internet.",
                                    color = Color.White.copy(alpha = 0.9f),
                                    fontSize = 11.5.sp
                                )
                            }
                        }

                        TextButton(
                            onClick = { openInternetSettings(context) },
                            colors = ButtonDefaults.textButtonColors(contentColor = Color.White)
                        ) {
                            Text(
                                text = "Connect",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 12.5.sp
                            )
                        }
                    }
                }
            }
        }
    }
