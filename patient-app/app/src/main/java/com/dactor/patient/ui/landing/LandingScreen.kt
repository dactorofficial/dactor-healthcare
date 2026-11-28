package com.dactor.patient.ui.landing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.patient.ui.navigation.NavRoutes
import androidx.compose.foundation.Image
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.dactor.patient.R
import com.dactor.patient.ui.components.QuickLanguageButton
import com.dactor.patient.ui.i18n.AppLanguage
import com.dactor.patient.ui.i18n.LocalAppLanguage
import com.dactor.patient.ui.i18n.LocalAppStrings

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LandingScreen(navController: NavController) {
    val strings = LocalAppStrings.current
    val isNepali = LocalAppLanguage.current == AppLanguage.NEPALI
    var trackingCodeInput by remember { mutableStateOf("") }
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Image(
                            painter = painterResource(id = R.drawable.app_logo),
                            contentDescription = "Dactor Nepal",
                            modifier = Modifier
                                .size(32.dp)
                                .clip(RoundedCornerShape(8.dp)),
                            contentScale = ContentScale.Fit
                        )
                        Text(if (isNepali) "डाक्टर नेपाल (Dactor)" else "Dactor Nepal", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    }
                },
                actions = {
                    QuickLanguageButton(compact = true)
                    IconButton(onClick = { navController.navigate(NavRoutes.Notifications.route) }) {
                        Icon(Icons.Default.Notifications, contentDescription = "Notifications")
                    }
                    IconButton(onClick = { navController.navigate(NavRoutes.Profile.route) }) {
                        Icon(Icons.Default.AccountCircle, contentDescription = "Profile")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Hero Value Proposition Card
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = if (isNepali) "नेपालमा स्मार्ट क्लिनिक अपोइन्टमेन्ट र प्रत्यक्ष लाम ट्र्याकिङ"
                        else "Smart Clinic Appointments & Live Queue Tracking in Nepal",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 19.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        lineHeight = 24.sp
                    )

                    Text(
                        text = if (isNepali) "अनलाइनबाट डाक्टरको पालो लिनुहोस्, प्रत्यक्ष टोकन स्थिति हेर्नुहोस्, र भिडभाड बिना नै ल्याब रिपोर्ट डाउनलोड गर्नुहोस्।"
                        else "Book in-person doctor appointments online, track your exact token position in real-time, and download diagnostic lab reports without waiting in crowded clinic lobbies.",
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        lineHeight = 18.sp
                    )

                    Button(
                        onClick = { navController.navigate(NavRoutes.PatientMain.route) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            if (isNepali) "सेवा, क्लिनिक र डाक्टर खोज्नुहोस्" else "Search Services, Clinics & Doctors",
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Quick 10-Digit Code Live Queue Tracker
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.TrackChanges, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(strings.queueRecords.trackingLookupTitle, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }

                    Text(
                        text = if (isNepali) "लगइन बिना नै आफ्नो 10-अङ्के कोड राखी अगाडि कति बिरामी छन् र डाक्टर कक्षको स्थिति हेर्नुहोस्।"
                        else "No login required! Enter your 10-digit appointment code to view how many patients are ahead of you and whether your doctor has arrived.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    OutlinedTextField(
                        value = trackingCodeInput,
                        onValueChange = {
                            if (it.length <= 10 && it.all { char -> char.isDigit() }) {
                                trackingCodeInput = it
                            }
                        },
                        label = { Text(strings.queueRecords.queueTrackingCodeLabel) },
                        placeholder = { Text(strings.queueRecords.enterTrackingCodePlaceholder) },
                        leadingIcon = { Icon(Icons.Default.Numbers, contentDescription = null) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true
                    )

                    Button(
                        onClick = {
                            if (trackingCodeInput.length == 10) {
                                navController.navigate(NavRoutes.QueueStatus.createRoute(trackingCodeInput))
                            }
                        },
                        enabled = trackingCodeInput.length == 10,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Visibility, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(strings.queueRecords.trackNowBtn, fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Quick Gateway Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedCard(
                    onClick = { navController.navigate("patient_main?tab=2") },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.Bookmarks, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(if (isNepali) "सुरक्षित कोडहरू" else "Saved Codes", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(if (isNepali) "तपाईंका अपोइन्टमेन्ट" else "Your appointments", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                OutlinedCard(
                    onClick = { navController.navigate(NavRoutes.Login.route) },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.Login, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(if (isNepali) "बिरामी खाता" else "Patient Account", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(if (isNepali) "गुगल साइन इन" else "Lean email sign-in", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedCard(
                    onClick = { navController.navigate("patient_main?tab=1") },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.Biotech, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(strings.queueRecords.labReportsTitle, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                        Text(if (isNepali) "परीक्षण नतिजा र PDF" else "Test results & PDFs", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                OutlinedCard(
                    onClick = { navController.navigate(NavRoutes.Notifications.route) },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Default.Notifications, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Text(if (isNepali) "सूचनाहरू" else "Notifications", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(if (isNepali) "लाम तथा पालो अलर्ट" else "FCM alerts & queue turns", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
