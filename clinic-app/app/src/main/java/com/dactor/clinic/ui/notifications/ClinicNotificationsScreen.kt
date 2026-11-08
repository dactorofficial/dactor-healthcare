package com.dactor.clinic.ui.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.R
import com.dactor.clinic.data.local.ClinicSessionManager
import com.dactor.clinic.data.model.DactorNotification
import com.dactor.clinic.data.model.NotificationTemplateData
import com.dactor.clinic.data.repository.QueueRepository
import kotlinx.coroutines.launch

private val NotifTeal = Color(0xFF00796B)
private val NotifTealDark = Color(0xFF004D40)
private val NotifTealSoft = Color(0xFFE0F2F1)
private val NotifSlateDark = Color(0xFF0F172A)
private val NotifSlateMuted = Color(0xFF64748B)

private data class NotifFilterItem(
    val key: String,
    val label: String,
    val icon: ImageVector
)

@Composable
fun DactorTemplateNotificationCard(
    item: DactorNotification,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val templateData = remember(item.title, item.message, item.type) {
        item.toTemplateData()
    }
    val formattedTimestamp = remember(item.createdAt) {
        val raw = (item.createdAt ?: "").take(16).replace("T", " • ")
        if (raw.isBlank()) "Now" else raw
    }

    Card(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(
            width = if (!item.isRead) 1.5.dp else 1.dp,
            color = if (!item.isRead) NotifTeal.copy(alpha = 0.45f) else Color(0xFFE2E8F0)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (!item.isRead) 4.dp else 1.dp),
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .clickable { onClick() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Header Row: App Logo + Dactor • Timestamp
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Image(
                        painter = painterResource(id = R.drawable.app_logo),
                        contentDescription = "Dactor Logo",
                        modifier = Modifier
                            .size(24.dp)
                            .clip(RoundedCornerShape(6.dp))
                    )
                    Text(
                        text = "Dactor • $formattedTimestamp",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF334155)
                    )
                }

                if (!item.isRead) {
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = NotifTealSoft
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .background(NotifTeal, CircleShape)
                            )
                            Text(
                                text = "New",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = NotifTealDark
                            )
                        }
                    }
                }
            }

            // Bold Title
            Text(
                text = templateData.title,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 17.sp,
                color = NotifSlateDark
            )

            // Clean Body Message
            Text(
                text = templateData.cleanMessage,
                fontSize = 14.sp,
                color = Color(0xFF334155),
                lineHeight = 20.sp
            )

            // Bottom 2-Column Pill Container matching Unified Notification Template
            val isArriveFast = templateData.rightValue.contains("arrive fast", ignoreCase = true) ||
                templateData.leftValue.contains("arrive fast", ignoreCase = true)

            Surface(
                shape = RoundedCornerShape(14.dp),
                color = Color(0xFFF1F6F8),
                border = BorderStroke(1.dp, if (isArriveFast) NotifTeal.copy(alpha = 0.35f) else Color(0xFFDCE8EC)),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Left Metric: Estimated Time Left / Status
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(if (isArriveFast) Color(0xFF0D5C4D) else NotifTeal, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                if (isArriveFast) Icons.Default.DirectionsRun else Icons.Default.Groups,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Column {
                            Text(
                                text = templateData.leftLabel,
                                fontSize = 11.sp,
                                color = NotifSlateMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = templateData.leftValue,
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (isArriveFast) Color(0xFF0D5C4D) else NotifSlateDark,
                                maxLines = 2,
                                lineHeight = 16.sp,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    // Vertical Divider
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 8.dp)
                            .width(1.dp)
                            .height(34.dp)
                            .background(Color(0xFFCBD5E1))
                    )

                    // Right Metric: Your Appointment Time / Schedule
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(if (isArriveFast) Color(0xFF0D5C4D) else NotifTeal, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                if (isArriveFast) Icons.Default.DirectionsRun else Icons.Default.EventAvailable,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Column {
                            Text(
                                text = templateData.rightLabel,
                                fontSize = 11.sp,
                                color = NotifSlateMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = templateData.rightValue,
                                fontSize = if (isArriveFast) 12.sp else 13.5.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (isArriveFast) Color(0xFF0D5C4D) else NotifSlateDark,
                                maxLines = 2,
                                lineHeight = 15.sp,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            if (!templateData.trackingCode.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFE2E8F0),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    Text(
                        text = "Code: ${templateData.trackingCode}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF334155),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicNotificationsScreen(
    navController: NavController,
    queueRepository: QueueRepository? = null,
    sessionManager: ClinicSessionManager? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val clinicId = remember { sessionManager?.getClinicId().orEmpty() }

    var selectedFilter by remember { mutableStateOf("All") }
    var notifications by remember { mutableStateOf<List<DactorNotification>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var showSendAlertDialog by remember { mutableStateOf(false) }

    suspend fun loadNotifications() {
        if (queueRepository == null || clinicId.isBlank()) return
        isLoading = true
        try {
            notifications = queueRepository.getClinicNotifications(clinicId)
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    LaunchedEffect(clinicId) {
        loadNotifications()
    }

    val filterItems = remember {
        listOf(
            NotifFilterItem("All", "All Alerts", Icons.Default.Notifications),
            NotifFilterItem("Queue", "Live Queue", Icons.Default.ConfirmationNumber),
            NotifFilterItem("Doctor", "Doctor Alerts", Icons.Default.Campaign),
            NotifFilterItem("Broadcast", "Broadcasts", Icons.Default.VolumeUp),
            NotifFilterItem("Lab", "Lab Reports", Icons.Default.Biotech)
        )
    }

    val filteredList = remember(selectedFilter, notifications) {
        when (selectedFilter) {
            "Queue" -> notifications.filter { it.type in listOf("queue_alert", "manual_alert", "clinic_break") }
            "Doctor" -> notifications.filter { it.type in listOf("doctor_arrival", "manual_alert", "clinic_break") }
            "Broadcast" -> notifications.filter { it.type in listOf("clinic_broadcast", "broadcast", "announcement") }
            "Lab" -> notifications.filter { it.type == "lab_report" }
            else -> notifications
        }
    }

    val unreadCount = remember(notifications) {
        notifications.count { !it.isRead }
    }

    Scaffold(
        topBar = {
            Surface(
                color = Color.White,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                ) {
                    TopAppBar(
                        modifier = Modifier.fillMaxWidth(),
                        windowInsets = WindowInsets(0, 0, 0, 0),
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                    title = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Image(
                                painter = painterResource(id = R.drawable.app_logo),
                                contentDescription = "Dactor",
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(RoundedCornerShape(7.dp))
                            )
                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Text(
                                        "Notifications & Alerts",
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 18.sp,
                                        color = NotifSlateDark
                                    )
                                    if (unreadCount > 0) {
                                        Surface(
                                            shape = RoundedCornerShape(50),
                                            color = NotifTeal
                                        ) {
                                            Text(
                                                text = "$unreadCount new",
                                                color = Color.White,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                            )
                                        }
                                    }
                                }
                                Text(
                                    "Patient alerts, queue turns & announcements",
                                    fontSize = 11.sp,
                                    color = NotifSlateMuted
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { navController.popBackStack() }) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = NotifSlateDark
                            )
                        }
                    },
                    actions = {
                        IconButton(onClick = { showSendAlertDialog = true }) {
                            Icon(
                                Icons.Default.Campaign,
                                contentDescription = "Send Alert",
                                tint = NotifTeal
                            )
                        }
                    }
                )
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF8FAFC))
        ) {
            // Horizontal Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                filterItems.forEach { item ->
                    val isSelected = selectedFilter == item.key
                    FilterChip(
                        selected = isSelected,
                        onClick = { selectedFilter = item.key },
                        label = { Text(item.label, fontSize = 12.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium) },
                        leadingIcon = {
                            Icon(
                                item.icon,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = if (isSelected) Color.White else NotifSlateMuted
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = NotifTeal,
                            selectedLabelColor = Color.White,
                            containerColor = Color.White,
                            labelColor = NotifSlateDark
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = isSelected,
                            borderColor = if (isSelected) NotifTeal else Color(0xFFCBD5E1)
                        )
                    )
                }
            }

            if (isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = NotifTeal)
                }
            } else if (filteredList.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFE0F2F1),
                            modifier = Modifier.size(72.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.NotificationsNone,
                                    contentDescription = null,
                                    modifier = Modifier.size(36.dp),
                                    tint = NotifTeal
                                )
                            }
                        }
                        Text(
                            "No Alerts Yet",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = NotifSlateDark
                        )
                        Text(
                            "Queue call alerts, doctor announcements, and patient updates will appear here in the unified Dactor template.",
                            fontSize = 13.sp,
                            color = NotifSlateMuted,
                            lineHeight = 18.sp
                        )
                        Button(
                            onClick = { showSendAlertDialog = true },
                            colors = ButtonDefaults.buttonColors(containerColor = NotifTeal),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.AddAlert, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Send Clinic Alert to Patients", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredList, key = { it.id }) { item ->
                        DactorTemplateNotificationCard(
                            item = item,
                            onClick = {
                                notifications = notifications.map {
                                    if (it.id == item.id) it.copy(isRead = true) else it
                                }
                            }
                        )
                    }
                }
            }
        }
    }

    // Dialog: Send Clinic Alert / Broadcast
    if (showSendAlertDialog) {
        var alertTitle by remember { mutableStateOf("") }
        var alertBody by remember { mutableStateOf("") }
        var alertStatusPill by remember { mutableStateOf("Clinic Alert") }
        var alertTargetPill by remember { mutableStateOf("All Patients") }
        var isSending by remember { mutableStateOf(false) }
        var sendError by remember { mutableStateOf<String?>(null) }
        var alertValidationTriggered by remember { mutableStateOf(false) }

        val isTitleError = (alertValidationTriggered || alertTitle.isNotEmpty()) && alertTitle.trim().length < 3
        val isBodyError = (alertValidationTriggered || alertBody.isNotEmpty()) && alertBody.trim().length < 5

        AlertDialog(
            onDismissRequest = { if (!isSending) showSendAlertDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Campaign, contentDescription = null, tint = NotifTeal)
                    Text("Send Alert to Patients", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "Broadcast an urgent announcement, delay notification, or clinic alert to all patients. Delivered instantly in the unified notification card.",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )

                    if (sendError != null) {
                        Surface(
                            color = MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                sendError.orEmpty(),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }

                    OutlinedTextField(
                        value = alertTitle,
                        onValueChange = {
                            alertTitle = it
                            if (sendError != null) sendError = null
                        },
                        label = { Text("Alert Title *") },
                        placeholder = { Text("e.g. Doctor Has Arrived / Delay Notice") },
                        singleLine = true,
                        isError = isTitleError,
                        supportingText = if (isTitleError) {
                            { Text("Required: At least 3 characters", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        } else null,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    OutlinedTextField(
                        value = alertBody,
                        onValueChange = {
                            alertBody = it
                            if (sendError != null) sendError = null
                        },
                        label = { Text("Message Body *") },
                        placeholder = { Text("e.g. Doctor has arrived at the clinic. Waiting patients please be ready.") },
                        minLines = 3,
                        maxLines = 5,
                        isError = isBodyError,
                        supportingText = if (isBodyError) {
                            { Text("Required: At least 5 characters", color = MaterialTheme.colorScheme.error, fontSize = 11.sp) }
                        } else null,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = alertStatusPill,
                            onValueChange = { alertStatusPill = it },
                            label = { Text("Left Pill (Status)") },
                            placeholder = { Text("Clinic Alert") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                        OutlinedTextField(
                            value = alertTargetPill,
                            onValueChange = { alertTargetPill = it },
                            label = { Text("Right Pill (Target)") },
                            placeholder = { Text("All Patients") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        alertValidationTriggered = true
                        if (alertTitle.trim().length < 3 || alertBody.trim().length < 5) {
                            sendError = "Please fill in valid Alert Title and Message Body."
                            return@Button
                        }
                        isSending = true
                        coroutineScope.launch {
                            val success = queueRepository?.sendClinicBroadcastNotification(
                                clinicId = clinicId,
                                title = alertTitle.trim(),
                                cleanMessage = alertBody.trim(),
                                leftLabel = "Status",
                                leftVal = alertStatusPill.trim().ifBlank { "Clinic Alert" },
                                rightLabel = "Target",
                                rightVal = alertTargetPill.trim().ifBlank { "All Patients" }
                            ) ?: false
                            isSending = false
                            if (success) {
                                showSendAlertDialog = false
                                loadNotifications()
                            } else {
                                sendError = "Failed to dispatch alert. Please check your network."
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = NotifTeal),
                    enabled = !isSending,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    if (isSending) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                        Spacer(Modifier.width(6.dp))
                        Text("Sending...")
                    } else {
                        Text("Dispatch Alert", fontWeight = FontWeight.Bold)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showSendAlertDialog = false },
                    enabled = !isSending
                ) {
                    Text("Cancel")
                }
            }
        )
    }
}
