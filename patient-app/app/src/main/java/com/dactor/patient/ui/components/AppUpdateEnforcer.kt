package com.dactor.patient.ui.components

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.dactor.patient.data.model.AppUpdateCheckResult
import com.dactor.patient.data.repository.AppUpdateRepository
import kotlinx.coroutines.launch

@Composable
fun AppUpdateEnforcer(
    appUpdateRepository: AppUpdateRepository
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()

    var updateResult by remember { mutableStateOf<AppUpdateCheckResult?>(null) }
    var isChecking by remember { mutableStateOf(true) }

    fun runUpdateCheck() {
        coroutineScope.launch {
            isChecking = true
            try {
                updateResult = appUpdateRepository.checkAppUpdate()
            } catch (_: Exception) {}
            isChecking = false
        }
    }

    // 1. Initial check on app startup
    LaunchedEffect(Unit) {
        runUpdateCheck()
    }

    // 2. Re-check automatically on app resume (e.g. after returning from Play Store)
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                runUpdateCheck()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    val result = updateResult
    // Compulsory modal dialog: completely blocks navigation and UI if update is required
    if (result != null && result.isUpdateRequired) {
        Dialog(
            onDismissRequest = { /* Compulsory: non-dismissible by tapping outside or back press */ },
            properties = DialogProperties(
                dismissOnBackPress = false,
                dismissOnClickOutside = false,
                usePlatformDefaultWidth = false
            )
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                shape = RoundedCornerShape(26.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 10.dp,
                shadowElevation = 24.dp,
                border = BorderStroke(1.dp, Color(0xFFE2E8F0))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp)
                        .verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // Update Icon with pulsing gradient halo
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(76.dp)
                            .background(
                                brush = Brush.radialGradient(
                                    colors = listOf(Color(0xFFE6FFFA), Color(0xFFCCFBF1), Color(0xFF99F6E4))
                                ),
                                shape = CircleShape
                            )
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF0D5C4D),
                            modifier = Modifier.size(54.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.SystemUpdate,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }
                    }

                    // Compulsory badge pill
                    Surface(
                        color = Color(0xFFFEF2F2),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFFFCA5A5))
                    ) {
                        Text(
                            text = "⚠ COMPULSORY UPDATE REQUIRED",
                            color = Color(0xFFDC2626),
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 11.sp,
                            letterSpacing = 0.5.sp,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }

                    Text(
                        text = "New Dactor Update Available",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F172A),
                        textAlign = TextAlign.Center
                    )

                    Text(
                        text = "To ensure live OPD queue accuracy, patient medical data privacy, and doctor presence notifications, updating to the latest version is mandatory.",
                        fontSize = 13.sp,
                        lineHeight = 18.5.sp,
                        color = Color(0xFF475569),
                        textAlign = TextAlign.Center
                    )

                    // Version comparison badge card
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceAround
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Installed", fontSize = 11.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Medium)
                                Text(
                                    "v${result.installedVersionName}",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Color(0xFFDC2626)
                                )
                                Text("Code: ${result.installedVersionCode}", fontSize = 10.sp, color = Color(0xFF94A3B8))
                            }

                            Icon(
                                imageVector = Icons.Default.ArrowForward,
                                contentDescription = null,
                                tint = Color(0xFF0D5C4D),
                                modifier = Modifier.size(18.dp)
                            )

                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Latest Required", fontSize = 11.sp, color = Color(0xFF0D5C4D), fontWeight = FontWeight.Bold)
                                Text(
                                    "v${result.latestVersionName}",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 14.sp,
                                    color = Color(0xFF0D5C4D)
                                )
                                Text("Code: ${result.latestVersionCode}", fontSize = 10.sp, color = Color(0xFF0D5C4D))
                            }
                        }
                    }

                    // Release notes card
                    if (result.releaseNotes.isNotBlank()) {
                        Surface(
                            color = Color(0xFFF0FDFA),
                            shape = RoundedCornerShape(14.dp),
                            border = BorderStroke(1.dp, Color(0xFFCCFBF1)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    "What's in this update:",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    color = Color(0xFF0D5C4D)
                                )
                                Text(
                                    text = result.releaseNotes,
                                    fontSize = 12.sp,
                                    lineHeight = 16.5.sp,
                                    color = Color(0xFF334155)
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(4.dp))

                    // Primary Button: Update Now
                    Button(
                        onClick = {
                            openAppUpdateDestination(context, result.updateUrl)
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF0D5C4D),
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.SystemUpdate,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Update Now via Play Store",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.5.sp
                        )
                    }

                    // Secondary Action: Clean Exit App
                    OutlinedButton(
                        onClick = {
                            (context as? Activity)?.finishAffinity()
                        },
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF64748B)),
                        border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.ExitToApp,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            "Exit App",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp
                        )
                    }

                    // Manual re-check link
                    TextButton(
                        onClick = { runUpdateCheck() },
                        enabled = !isChecking,
                        modifier = Modifier.height(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = Color(0xFF0D5C4D)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            if (isChecking) "Checking for updates..." else "Already updated? Tap to verify",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color(0xFF0D5C4D)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Directs patient to Google Play Store details page or specified update URL.
 */
private fun openAppUpdateDestination(context: Context, customUrl: String) {
    val playStoreMarketUri = Uri.parse("market://details?id=${context.packageName}")
    val marketIntent = Intent(Intent.ACTION_VIEW, playStoreMarketUri).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

    try {
        context.startActivity(marketIntent)
    } catch (_: Exception) {
        // Fallback to web browser URL
        val targetUrl = customUrl.ifBlank {
            "https://play.google.com/store/apps/details?id=${context.packageName}"
        }
        val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        try {
            context.startActivity(webIntent)
        } catch (ignored: Exception) {}
    }
}
