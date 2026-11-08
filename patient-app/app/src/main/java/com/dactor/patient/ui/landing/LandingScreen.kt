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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LandingScreen(navController: NavController) {
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
                        Text("Dactor Nepal", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                    }
                },
                actions = {
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
                        text = "Smart Clinic Appointments & Live Queue Tracking in Nepal",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 19.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        lineHeight = 24.sp
                    )

                    Text(
                        text = "Book in-person doctor appointments online, track your exact token position in real-time, and download diagnostic lab reports without waiting in crowded clinic lobbies.",
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
                        Text("Search Services, Clinics & Doctors", fontWeight = FontWeight.Bold)
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
                        Text("Instant Live Queue Tracker", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }

                    Text(
                        text = "No login required! Enter your 10-digit appointment code to view how many patients are ahead of you and whether your doctor has arrived.",
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
                        label = { Text("10-Digit Tracking Code") },
                        placeholder = { Text("Enter 10-digit code") },
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
                        Text("Track Queue Position Now", fontWeight = FontWeight.Bold)
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
                        Text("Saved Codes", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("Your appointments", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                        Text("Patient Account", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("Lean email sign-in", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                        Text("Lab Reports", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("Test results & PDFs", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                        Text("Notifications", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("FCM alerts & queue turns", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
