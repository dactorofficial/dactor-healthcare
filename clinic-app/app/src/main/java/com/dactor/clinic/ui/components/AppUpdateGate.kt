package com.dactor.clinic.ui.components

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.dactor.clinic.R
import com.dactor.clinic.data.repository.AppUpdateRepository
import com.dactor.clinic.data.repository.UpdateCheckResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Compulsory App Update Gate.
 * When a mandatory update is detected via Supabase Cloud Policy or Google Play Store In-App Updates,
 * this gate takes over the entire viewport and locks the app until the user updates.
 * Back presses are disabled, and no dismiss or skip options are provided.
 */
@Composable
fun AppUpdateGate(
    appUpdateRepository: AppUpdateRepository,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()

    var checkResult by remember { mutableStateOf<UpdateCheckResult?>(null) }
    var isChecking by remember { mutableStateOf(false) }

    fun runUpdateCheck() {
        coroutineScope.launch {
            isChecking = true
            try {
                val res = appUpdateRepository.checkUpdateRequirement()
                checkResult = res
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isChecking = false
            }
        }
    }

    // 1. Initial check on startup
    LaunchedEffect(Unit) {
        runUpdateCheck()
    }

    // 2. Lifecycle observer: resumes in-progress Play Store updates and re-evaluates version on return
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                if (activity != null) {
                    appUpdateRepository.resumeImmediateUpdateIfInProgress(activity)
                }
                runUpdateCheck()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    val isUpdateRequired = checkResult?.isUpdateRequired == true

    if (isUpdateRequired) {
        val result = checkResult!!
        val policy = result.policy
        val targetVersionName = policy.latestVersionName.ifBlank { "Latest" }
        val targetVersionCode = if (policy.minVersionCode > 0) policy.minVersionCode else policy.latestVersionCode

        // Strict Enforcement: Back button cannot dismiss or bypass the update gate
        BackHandler(enabled = true) {
            // Intentionally blocked — app update is compulsory
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xFF0F172A),
                            Color(0xFF1E293B),
                            Color(0xFF0F172A)
                        )
                    )
                )
                .statusBarsPadding()
                .navigationBarsPadding(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Official Dactor Logo
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = Color.White,
                    shadowElevation = 10.dp,
                    border = BorderStroke(1.5.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.size(92.dp)
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.padding(14.dp)
                    ) {
                        Image(
                            painter = painterResource(id = R.drawable.app_logo),
                            contentDescription = "Dactor Official Logo",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }

                Spacer(Modifier.height(20.dp))

                // Compulsory Update Pill Badge
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = Color(0xFFE11D48).copy(alpha = 0.15f),
                    border = BorderStroke(1.dp, Color(0xFFE11D48).copy(alpha = 0.4f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFE11D48),
                            modifier = Modifier.size(8.dp)
                        ) {}
                        Text(
                            text = "COMPULSORY UPDATE REQUIRED",
                            color = Color(0xFFFF4D6D),
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 11.sp,
                            letterSpacing = 0.5.sp
                        )
                    }
                }

                Spacer(Modifier.height(14.dp))

                // Headline
                Text(
                    text = "Update Required to Continue",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 22.sp,
                    textAlign = TextAlign.Center
                )

                Spacer(Modifier.height(8.dp))

                // Explanatory Subtitle
                Text(
                    text = "A critical update is required for Dactor Clinic. Older app versions are restricted to maintain patient queue accuracy, live OPD scheduling, and clinical data security.",
                    color = Color(0xFF94A3B8),
                    fontSize = 13.5.sp,
                    lineHeight = 19.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )

                Spacer(Modifier.height(24.dp))

                // Version Comparison Card
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                    border = BorderStroke(1.dp, Color(0xFF334155)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Your Version",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFF94A3B8)
                                )
                                Spacer(Modifier.height(3.dp))
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFF334155),
                                    modifier = Modifier.padding(top = 2.dp)
                                ) {
                                    Text(
                                        text = "v${result.currentVersionName} (${result.currentVersionCode})",
                                        color = Color(0xFFCBD5E1),
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 12.sp,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }

                            Text(
                                text = "➔",
                                color = Color(0xFF38BDF8),
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 10.dp)
                            )

                            Column(
                                modifier = Modifier.weight(1f),
                                horizontalAlignment = Alignment.End
                            ) {
                                Text(
                                    text = "Required Version",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFF94A3B8)
                                )
                                Spacer(Modifier.height(3.dp))
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color(0xFF0284C7).copy(alpha = 0.2f),
                                    border = BorderStroke(1.dp, Color(0xFF0284C7).copy(alpha = 0.6f)),
                                    modifier = Modifier.padding(top = 2.dp)
                                ) {
                                    Text(
                                        text = "v$targetVersionName ($targetVersionCode+)",
                                        color = Color(0xFF38BDF8),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }

                        if (policy.releaseNotes.isNotBlank()) {
                            HorizontalDivider(
                                color = Color(0xFF334155),
                                thickness = 1.dp,
                                modifier = Modifier.padding(vertical = 12.dp)
                            )

                            Row(
                                verticalAlignment = Alignment.Top,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Info,
                                    contentDescription = null,
                                    tint = Color(0xFF38BDF8),
                                    modifier = Modifier.size(16.dp).padding(top = 2.dp)
                                )
                                Text(
                                    text = policy.releaseNotes,
                                    color = Color(0xFFE2E8F0),
                                    fontSize = 12.5.sp,
                                    lineHeight = 17.sp
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(28.dp))

                // Primary Compulsory Action: UPDATE NOW
                Button(
                    onClick = {
                        appUpdateRepository.launchUpdate(activity, policy.updateUrl)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
                ) {
                    Icon(
                        imageVector = Icons.Default.SystemUpdate,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(19.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "UPDATE APP NOW",
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        letterSpacing = 0.5.sp
                    )
                }

                Spacer(Modifier.height(14.dp))

                // Secondary Verification / Refresh Action
                OutlinedButton(
                    onClick = {
                        runUpdateCheck()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Color(0xFF475569)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF94A3B8))
                ) {
                    if (isChecking) {
                        CircularProgressIndicator(
                            color = Color(0xFF38BDF8),
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Checking status...",
                            fontSize = 12.5.sp,
                            color = Color(0xFFCBD5E1)
                        )
                    } else {
                        Text(
                            text = "Already Updated? Verify Version",
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFCBD5E1)
                        )
                    }
                }

                Spacer(Modifier.height(20.dp))

                // Need Help / Support Link
                TextButton(
                    onClick = {
                        try {
                            val supportIntent = Intent(
                                Intent.ACTION_VIEW,
                                Uri.parse("https://dactorofficial.github.io/support")
                            ).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            context.startActivity(supportIntent)
                        } catch (_: Exception) {}
                    }
                ) {
                    Icon(
                        imageVector = Icons.Default.OpenInNew,
                        contentDescription = null,
                        tint = Color(0xFF64748B),
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "Need assistance? Contact Dactor Support",
                        color = Color(0xFF64748B),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Normal
                    )
                }
            }
        }
    } else {
        // App is up to date or update not enforced: render normal app content
        content()
    }
}
