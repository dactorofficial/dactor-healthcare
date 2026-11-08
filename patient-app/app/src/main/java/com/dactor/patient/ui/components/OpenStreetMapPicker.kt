package com.dactor.patient.ui.components

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun OpenStreetMapPicker(
    initialAddress: String,
    initialLat: Double,
    initialLng: Double,
    onSaveLocation: (address: String, lat: Double, lng: Double) -> Unit,
    onDismiss: () -> Unit
) {
    var addressText by remember { mutableStateOf(initialAddress.ifBlank { "Kathmandu, Nepal" }) }
    var currentLat by remember { mutableDoubleStateOf(if (initialLat != 0.0) initialLat else 27.7052) }
    var currentLng by remember { mutableDoubleStateOf(if (initialLng != 0.0) initialLng else 85.3193) }

    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    val context = androidx.compose.ui.platform.LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var isFetchingLocation by remember { mutableStateOf(false) }
    var showEnableGpsDialog by remember { mutableStateOf(false) }
    var showPermissionSettingsDialog by remember { mutableStateOf(false) }

    fun isDeviceLocationEnabled(): Boolean {
        val locManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        return try {
            locManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        } catch (e: Exception) {
            false
        }
    }

    fun reverseGeocode(lat: Double, lng: Double) {
        coroutineScope.launch(Dispatchers.IO) {
            try {
                val geocoder = Geocoder(context, Locale.getDefault())
                val addresses = geocoder.getFromLocation(lat, lng, 1)
                if (!addresses.isNullOrEmpty()) {
                    val addr = addresses[0]
                    val parts = listOfNotNull(
                        addr.featureName,
                        addr.subLocality,
                        addr.locality,
                        addr.subAdminArea,
                        addr.adminArea
                    ).distinct()
                    val addrStr = parts.joinToString(", ")
                    if (addrStr.isNotBlank()) {
                        withContext(Dispatchers.Main) {
                            addressText = addrStr
                        }
                    }
                }
            } catch (ignored: Exception) {}
        }
    }

    fun applyLocationResult(lat: Double, lng: Double) {
        coroutineScope.launch(Dispatchers.IO) {
            var addressResult = ""
            try {
                val geocoder = Geocoder(context, Locale.getDefault())
                val addresses = geocoder.getFromLocation(lat, lng, 1)
                if (!addresses.isNullOrEmpty()) {
                    val addr = addresses[0]
                    val parts = listOfNotNull(
                        addr.featureName,
                        addr.subLocality,
                        addr.locality,
                        addr.subAdminArea,
                        addr.adminArea
                    ).distinct()
                    addressResult = parts.joinToString(", ")
                }
            } catch (ignored: Exception) {}

            if (addressResult.isBlank()) {
                addressResult = "Location (${String.format(Locale.US, "%.5f", lat)}, ${String.format(Locale.US, "%.5f", lng)})"
            }

            withContext(Dispatchers.Main) {
                currentLat = lat
                currentLng = lng
                addressText = addressResult
                isFetchingLocation = false
                webViewRef?.evaluateJavascript("if(window.moveToCoords) window.moveToCoords($lat, $lng);", null)
            }
        }
    }

    fun executeGpsFetch() {
        val locManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (locManager == null) {
            isFetchingLocation = false
            return
        }

        if (!isDeviceLocationEnabled()) {
            isFetchingLocation = false
            showEnableGpsDialog = true
            return
        }

        isFetchingLocation = true

        var lastBest: Location? = null
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        for (p in providers) {
            try {
                val loc = locManager.getLastKnownLocation(p)
                if (loc != null && (lastBest == null || loc.accuracy < lastBest.accuracy)) {
                    lastBest = loc
                }
            } catch (ignored: Exception) {}
        }
        if (lastBest != null) {
            applyLocationResult(lastBest.latitude, lastBest.longitude)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val provider = when {
                    locManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                    locManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                    else -> LocationManager.PASSIVE_PROVIDER
                }
                locManager.getCurrentLocation(provider, null, context.mainExecutor) { liveLoc ->
                    if (liveLoc != null) {
                        applyLocationResult(liveLoc.latitude, liveLoc.longitude)
                    } else if (provider == LocationManager.GPS_PROVIDER && locManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                        locManager.getCurrentLocation(LocationManager.NETWORK_PROVIDER, null, context.mainExecutor) { netLoc ->
                            if (netLoc != null) {
                                applyLocationResult(netLoc.latitude, netLoc.longitude)
                            } else {
                                coroutineScope.launch(Dispatchers.Main) { isFetchingLocation = false }
                            }
                        }
                    } else {
                        coroutineScope.launch(Dispatchers.Main) { isFetchingLocation = false }
                    }
                }
            } else {
                val listener = object : LocationListener {
                    override fun onLocationChanged(loc: Location) {
                        locManager.removeUpdates(this)
                        applyLocationResult(loc.latitude, loc.longitude)
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(p: String?, s: Int, e: Bundle?) {}
                    override fun onProviderEnabled(p: String) {}
                    override fun onProviderDisabled(p: String) {}
                }
                if (locManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    locManager.requestSingleUpdate(LocationManager.NETWORK_PROVIDER, listener, Looper.getMainLooper())
                } else if (locManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locManager.requestSingleUpdate(LocationManager.GPS_PROVIDER, listener, Looper.getMainLooper())
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            if (lastBest == null) {
                coroutineScope.launch(Dispatchers.Main) { isFetchingLocation = false }
            }
        }
    }

    val gpsSettingsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        if (isDeviceLocationEnabled()) {
            executeGpsFetch()
        }
    }

    val locationPermLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                      perms[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            executeGpsFetch()
        } else {
            isFetchingLocation = false
            showPermissionSettingsDialog = true
        }
    }

    fun fetchCurrentGpsLocation() {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasFine || hasCoarse) {
            executeGpsFetch()
        } else {
            locationPermLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        }
    }

    LaunchedEffect(Unit) {
        val hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasFine || hasCoarse) {
            executeGpsFetch()
        }
    }

    val nepalPresets = remember {
        listOf(
            Triple("Kathmandu", 27.7172, 85.3240),
            Triple("Lalitpur (Patan)", 27.6674, 85.3206),
            Triple("Bhaktapur", 27.6710, 85.4298),
            Triple("Pokhara", 28.2096, 83.9856),
            Triple("Biratnagar", 26.4525, 87.2718),
            Triple("Birgunj", 27.0104, 84.8774),
            Triple("Chitwan (Bharatpur)", 27.5291, 84.3542),
            Triple("Dharan", 26.8124, 87.2834),
            Triple("Butwal", 27.7006, 83.4484),
            Triple("Nepalgunj", 28.0500, 81.6167)
        )
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            Icons.Default.Map,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Text(
                            "Pick Location on Free Map",
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                // Address input bar
                OutlinedTextField(
                    value = addressText,
                    onValueChange = { addressText = it },
                    label = { Text("Selected Address / Landmark") },
                    leadingIcon = {
                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    trailingIcon = {
                        IconButton(onClick = { fetchCurrentGpsLocation() }) {
                            Icon(Icons.Default.MyLocation, contentDescription = "Live GPS", tint = MaterialTheme.colorScheme.primary)
                        }
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                // Quick Nepal Cities Pills & GPS
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    FilledTonalButton(
                        onClick = { fetchCurrentGpsLocation() },
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        modifier = Modifier.defaultMinSize(minHeight = 36.dp),
                        enabled = !isFetchingLocation
                    ) {
                        if (isFetchingLocation) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.MyLocation, contentDescription = null, modifier = Modifier.size(15.dp))
                        }
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (isFetchingLocation) "Getting GPS..." else "Current GPS Location",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                    }

                    nepalPresets.forEach { (name, lat, lng) ->
                        FilterChip(
                            selected = (name == addressText),
                            onClick = {
                                addressText = name
                                currentLat = lat
                                currentLng = lng
                                webViewRef?.evaluateJavascript(
                                    "if(window.moveToCoords) window.moveToCoords($lat, $lng);",
                                    null
                                )
                            },
                            label = { Text(name, fontSize = 11.sp, maxLines = 1) },
                            leadingIcon = {
                                Icon(Icons.Default.Place, contentDescription = null, modifier = Modifier.size(14.dp))
                            }
                        )
                    }
                }

                // Map Container (100% Free OpenStreetMap Engine)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
                ) {
                    AndroidView(
                        factory = { ctx ->
                            WebView(ctx).apply {
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.databaseEnabled = true
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                }
                                settings.cacheMode = WebSettings.LOAD_DEFAULT
                                settings.userAgentString = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 DactorApp/2.0"
                                webChromeClient = WebChromeClient()
                                webViewClient = object : WebViewClient() {
                                    override fun onReceivedSslError(view: WebView?, handler: android.webkit.SslErrorHandler?, error: android.net.http.SslError?) {
                                        handler?.cancel()
                                    }
                                }

                                addJavascriptInterface(object {
                                    @JavascriptInterface
                                    fun onMarkerMoved(lat: Double, lng: Double) {
                                        post {
                                            currentLat = lat
                                            currentLng = lng
                                            reverseGeocode(lat, lng)
                                        }
                                    }
                                }, "AndroidInterface")

                                val html = """
                                    <!DOCTYPE html>
                                    <html>
                                    <head>
                                      <meta charset="utf-8" />
                                      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                                      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" onerror="this.onerror=null;this.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';" />
                                      <style>
                                        * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
                                        html, body, #map { width: 100%; height: 100%; overflow: hidden; background: #e2e8f0; }
                                        .center-pin-container {
                                          position: absolute;
                                          top: 50%;
                                          left: 50%;
                                          transform: translate(-50%, -100%);
                                          z-index: 1000;
                                          pointer-events: none;
                                          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35));
                                          transition: transform 0.15s ease-out;
                                        }
                                        .pin-shadow {
                                          position: absolute;
                                          top: 50%;
                                          left: 50%;
                                          transform: translate(-50%, -50%);
                                          width: 14px;
                                          height: 6px;
                                          background: rgba(15, 23, 42, 0.35);
                                          border-radius: 50%;
                                          z-index: 999;
                                          pointer-events: none;
                                        }
                                        .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }
                                        .custom-controls {
                                          position: absolute;
                                          right: 12px;
                                          bottom: 16px;
                                          z-index: 1001;
                                          display: flex;
                                          flex-direction: column;
                                          gap: 6px;
                                        }
                                        .ctrl-btn {
                                          width: 38px;
                                          height: 38px;
                                          border-radius: 10px;
                                          background: rgba(255,255,255,0.95);
                                          border: 1px solid #cbd5e1;
                                          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                                          font-size: 20px;
                                          font-weight: bold;
                                          color: #0f172a;
                                          display: flex;
                                          align-items: center;
                                          justify-content: center;
                                          cursor: pointer;
                                        }
                                        .ctrl-btn:active { background: #e2e8f0; }
                                      </style>
                                      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';document.head.appendChild(s);"></script>
                                    </head>
                                    <body>
                                      <div id="map"></div>
                                      <div class="pin-shadow"></div>
                                      <div class="center-pin-container" id="centerPin">
                                        <svg width="40" height="50" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M17 0C7.61 0 0 7.61 0 17c0 13.5 17 27 17 27s17-13.5 17-27C34 7.61 26.39 0 17 0z" fill="#0284C7"/>
                                          <circle cx="17" cy="17" r="7.5" fill="#FFFFFF"/>
                                          <circle cx="17" cy="17" r="3.5" fill="#0284C7"/>
                                        </svg>
                                      </div>
                                      <div class="custom-controls">
                                        <button class="ctrl-btn" id="btnZoomIn">+</button>
                                        <button class="ctrl-btn" id="btnZoomOut">−</button>
                                      </div>
                                      <script>
                                        (function() {
                                          var initLat = $currentLat;
                                          var initLng = $currentLng;
                                          var map = null;

                                          function initMap() {
                                            if (typeof L === 'undefined') {
                                              setTimeout(initMap, 100);
                                              return;
                                            }
                                            try {
                                              map = L.map('map', {
                                                center: [initLat, initLng],
                                                zoom: 15,
                                                zoomControl: false,
                                                attributionControl: false
                                              });

                                              L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                                                subdomains: 'abcd',
                                                maxZoom: 19,
                                                attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
                                              }).addTo(map);

                                              setTimeout(function() { map.invalidateSize(); }, 150);
                                              setTimeout(function() { map.invalidateSize(); }, 400);

                                              var debounceTimer;
                                              function emitLocation() {
                                                if (!map) return;
                                                var c = map.getCenter();
                                                if (window.AndroidInterface && window.AndroidInterface.onMarkerMoved) {
                                                  window.AndroidInterface.onMarkerMoved(c.lat, c.lng);
                                                }
                                              }

                                              map.on('movestart', function() {
                                                var pin = document.getElementById('centerPin');
                                                if (pin) pin.style.transform = 'translate(-50%, -115%) scale(1.05)';
                                              });

                                              map.on('moveend', function() {
                                                var pin = document.getElementById('centerPin');
                                                if (pin) pin.style.transform = 'translate(-50%, -100%) scale(1)';
                                                clearTimeout(debounceTimer);
                                                debounceTimer = setTimeout(emitLocation, 60);
                                              });

                                              map.on('click', function(e) {
                                                map.flyTo(e.latlng, map.getZoom(), { duration: 1.0 });
                                              });

                                              document.getElementById('btnZoomIn').onclick = function() {
                                                if (map) map.zoomIn();
                                              };
                                              document.getElementById('btnZoomOut').onclick = function() {
                                                if (map) map.zoomOut();
                                              };
                                            } catch (e) {
                                              console.error(e);
                                            }
                                          }

                                          window.moveToCoords = function(lat, lng) {
                                            if (map) {
                                              map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 1.2 });
                                            }
                                          };

                                          window.addEventListener('resize', function() {
                                            if (map) map.invalidateSize();
                                          });

                                          initMap();
                                        })();
                                      </script>
                                    </body>
                                    </html>
                                """.trimIndent()

                                loadDataWithBaseURL("https://basemaps.cartocdn.com", html, "text/html", "UTF-8", null)
                                webViewRef = this
                            }
                        },
                        modifier = Modifier.fillMaxSize()
                    )

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                        tonalElevation = 4.dp,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(8.dp)
                    ) {
                        Text(
                            text = "📍 Tap anywhere on map to place pin or drag to pan",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                "Selected Coordinates",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                "${String.format(Locale.US, "%.5f", currentLat)}° N, ${String.format(Locale.US, "%.5f", currentLng)}° E",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Text(
                            "Live GPS Map Verified",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .weight(1f)
                            .defaultMinSize(minHeight = 44.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Cancel", fontSize = 13.sp)
                    }

                    Button(
                        onClick = {
                            val finalAddress = if (addressText.isNotBlank()) addressText else {
                                "Location (${String.format(Locale.US, "%.4f", currentLat)}, ${String.format(Locale.US, "%.4f", currentLng)})"
                            }
                            onSaveLocation(finalAddress, currentLat, currentLng)
                        },
                        modifier = Modifier
                            .weight(1.4f)
                            .defaultMinSize(minHeight = 44.dp),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Confirm Location", fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
            }
        }
    }

    if (showEnableGpsDialog) {
        AlertDialog(
            onDismissRequest = { showEnableGpsDialog = false },
            icon = { Icon(Icons.Default.MyLocation, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            title = { Text("Turn On Location Services", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Your phone's GPS / Location Services are turned off. Please enable Location Services so Dactor can detect your exact location on the map.",
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                Button(onClick = {
                    showEnableGpsDialog = false
                    try {
                        gpsSettingsLauncher.launch(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    } catch (e: Exception) {
                        context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    }
                }) {
                    Text("Turn On Location")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEnableGpsDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    if (showPermissionSettingsDialog) {
        AlertDialog(
            onDismissRequest = { showPermissionSettingsDialog = false },
            icon = { Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            title = { Text("Location Permission Needed", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "Location permission is required to automatically find your current position on the map. Please allow Location permission.",
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                Button(onClick = {
                    showPermissionSettingsDialog = false
                    try {
                        val intent = Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null)
                        )
                        context.startActivity(intent)
                    } catch (ignored: Exception) {}
                }) {
                    Text("Open Settings")
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    showPermissionSettingsDialog = false
                    locationPermLauncher.launch(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                    )
                }) {
                    Text("Ask Again")
                }
            }
        )
    }
}
