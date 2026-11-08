package com.dactor.patient.ui.notifications

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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.patient.R
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.model.DactorNotification
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.AuthRepository
import com.dactor.patient.data.repository.NotificationRepository
import com.dactor.patient.ui.navigation.NavRoutes
import kotlinx.coroutines.launch

private val NotifTeal = Color(0xFF00796B)
private val NotifTealDark = Color(0xFF004D40)
private val NotifTealSoft = Color(0xFFE0F2F1)
private val NotifBg = Color(0xFFF8FAFC)
private val NotifSlateDark = Color(0xFF0F172A)
private val NotifSlateMuted = Color(0xFF64748B)
private val NotifBorder = Color(0xFFE2E8F0)

private data class NotifFilterItem(
    val key: String,
    val label: String,
    val icon: ImageVector
)

@Composable
fun DactorTemplateNotificationCard(
    item: DactorNotification,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    actionLabel: String? = null
) {
    val templateData = remember(item.title, item.message, item.type) {
        item.toTemplateData()
    }
    val formattedTimestamp = remember(item.createdAt) {
        val raw = item.createdAt.take(16).replace("T", " • ")
        if (raw.isBlank()) "Now" else raw
    }

    Card(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color.White
        ),
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
            // Header Row: Real App Logo + Dactor • Now
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
                                text = "Now",
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

            // Bottom 2-Column Pill Container: ONLY for Queue Status Reminders
            if (templateData.isQueueReminder) {
                val isArriveFast = templateData.rightValue.contains("arrive fast", ignoreCase = true) ||
                    templateData.leftValue.contains("arrive fast", ignoreCase = true)

                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color.White,
                    border = BorderStroke(1.dp, if (isArriveFast) NotifTeal.copy(alpha = 0.35f) else Color(0xFFE2E8F0)),
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
                        // Left Metric: Estimated Time Left
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

                        // Right Metric: Your Appointment Time / Turn Status
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
            }

            if (actionLabel != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = NotifTealSoft,
                        border = BorderStroke(1.dp, NotifTeal.copy(alpha = 0.35f)),
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { onClick() }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Text(
                                text = actionLabel,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = NotifTealDark
                            )
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowForward,
                                contentDescription = null,
                                tint = NotifTealDark,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    navController: NavController,
    notificationRepository: NotificationRepository? = null,
    sessionManager: UserSessionManager? = null,
    authRepository: AuthRepository? = null,
    appointmentRepository: AppointmentRepository? = null
) {
    var selectedFilter by remember { mutableStateOf("All") }
    var notifications by remember { mutableStateOf<List<DactorNotification>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    suspend fun loadNotifications() {
        if (notificationRepository == null) return
        isLoading = true
        try {
            val userId = authRepository?.getCurrentUser() ?: sessionManager?.getSavedPatientId()
            val email = sessionManager?.getSavedEmail()?.takeIf { it.isNotBlank() }
                ?: authRepository?.getCurrentUserEmail()?.takeIf { it.isNotBlank() }
            val phone = sessionManager?.getSavedPhone()?.takeIf { it.isNotBlank() }
            val savedCodes = sessionManager?.getSavedTrackingCodes()?.map { it.first } ?: emptyList()
            val allIds = savedCodes.toMutableSet()
            if (appointmentRepository != null) {
                try {
                    val appts = appointmentRepository.getAllPatientAppointments(
                        userId = userId,
                        email = email,
                        phone = phone,
                        trackingCodes = savedCodes
                    )
                    for (appt in appts) {
                        if (appt.id.isNotBlank()) allIds.add(appt.id)
                        if (appt.trackingCode10Digit.isNotBlank()) allIds.add(appt.trackingCode10Digit)
                    }
                } catch (_: Exception) {}
            }
            val fetched = notificationRepository.getNotifications(
                userId = userId,
                appointmentIds = allIds.toList()
            )
            notifications = fetched
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        loadNotifications()
    }

    val filterItems = remember {
        listOf(
            NotifFilterItem("All", "All", Icons.Default.Notifications),
            NotifFilterItem("Queue", "Live Queue", Icons.Default.ConfirmationNumber),
            NotifFilterItem("Doctor Alerts", "Doctor Alerts", Icons.Default.Campaign),
            NotifFilterItem("Lab", "Lab Reports", Icons.Default.Biotech),
            NotifFilterItem("Announcements", "Updates", Icons.Default.Info)
        )
    }

    val filteredList = remember(selectedFilter, notifications) {
        when (selectedFilter) {
            "Doctor Alerts" -> notifications.filter { it.type in listOf("manual_alert", "queue_alert", "clinic_break") }
            "Queue" -> notifications.filter { it.type in listOf("queue_alert", "doctor_arrival", "manual_alert", "clinic_break") }
            "Lab" -> notifications.filter { it.type == "lab_report" }
            "Announcements" -> notifications.filter { it.type == "announcement" || it.type == "clinic_break" }
            else -> notifications
        }
    }

    val unreadCount = remember(notifications) {
        notifications.count { !it.isRead }
    }

    Scaffold(
        containerColor = NotifBg,
        topBar = {
            Surface(
                color = Color.White,
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                TopAppBar(
                    modifier = Modifier.fillMaxWidth(),
                    windowInsets = TopAppBarDefaults.windowInsets,
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
                                            "Notifications",
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
                                        "Queue turns, doctor alerts & lab reports",
                                        fontSize = 11.sp,
                                        color = NotifSlateMuted,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
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
                            if (unreadCount > 0) {
                                Surface(
                                    shape = RoundedCornerShape(20.dp),
                                    color = NotifTealSoft,
                                    border = BorderStroke(1.dp, NotifTeal.copy(alpha = 0.35f)),
                                    modifier = Modifier
                                        .padding(end = 4.dp)
                                        .clip(RoundedCornerShape(20.dp))
                                        .clickable {
                                            val unreadIds = notifications.filter { !it.isRead }.map { it.id }
                                            notifications = notifications.map { it.copy(isRead = true) }
                                            coroutineScope.launch {
                                                try {
                                                    notificationRepository?.markAllAsRead(unreadIds)
                                                } catch (e: Exception) {
                                                    e.printStackTrace()
                                                }
                                            }
                                        }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.DoneAll,
                                            contentDescription = null,
                                            tint = NotifTealDark,
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Text(
                                            "Mark all read",
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = NotifTealDark
                                        )
                                    }
                                }
                            }
                        IconButton(
                            onClick = {
                                coroutineScope.launch {
                                    loadNotifications()
                                }
                            }
                        ) {
                            Icon(
                                Icons.Default.Refresh,
                                contentDescription = "Refresh",
                                tint = NotifSlateDark
                            )
                        }
                    }
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // ── HORIZONTAL CATEGORY FILTER PILLS ──────────────────────────────
            Surface(
                color = Color.White,
                border = BorderStroke(1.dp, Color(0xFFF1F5F9))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    filterItems.forEach { item ->
                        val isSelected = selectedFilter == item.key
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = if (isSelected) NotifTeal else Color(0xFFF1F5F9),
                            border = BorderStroke(
                                1.dp,
                                if (isSelected) NotifTeal else Color(0xFFE2E8F0)
                            ),
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .clickable { selectedFilter = item.key }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    item.icon,
                                    contentDescription = null,
                                    tint = if (isSelected) Color.White else NotifSlateMuted,
                                    modifier = Modifier.size(15.dp)
                                )
                                Text(
                                    text = item.label,
                                    fontSize = 12.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.SemiBold,
                                    color = if (isSelected) Color.White else NotifSlateDark
                                )
                            }
                        }
                    }
                }
            }

            if (isLoading && notifications.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        CircularProgressIndicator(color = NotifTeal, strokeWidth = 3.dp)
                        Text(
                            "Checking for latest updates...",
                            fontSize = 13.sp,
                            color = NotifSlateMuted,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            } else if (filteredList.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Card(
                        shape = RoundedCornerShape(24.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        border = BorderStroke(1.dp, NotifBorder),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 24.dp, vertical = 32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = NotifTealSoft,
                                modifier = Modifier.size(76.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.NotificationsNone,
                                        contentDescription = null,
                                        tint = NotifTeal,
                                        modifier = Modifier.size(38.dp)
                                    )
                                }
                            }
                            Text(
                                text = if (selectedFilter == "All") "You're all caught up!" else "No $selectedFilter notifications",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 17.sp,
                                color = NotifSlateDark
                            )
                            Text(
                                text = "Live OPD queue turn alerts, doctor arrival updates, clinic break notices, and diagnostic lab reports will appear here automatically.",
                                fontSize = 13.sp,
                                color = NotifSlateMuted,
                                textAlign = TextAlign.Center,
                                lineHeight = 19.sp
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            OutlinedButton(
                                onClick = {
                                    coroutineScope.launch {
                                        loadNotifications()
                                    }
                                },
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, NotifTeal.copy(alpha = 0.4f)),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = NotifTeal)
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Refresh Alerts", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredList, key = { it.id }) { item ->
                        val parsedMeta = item.toTemplateData()
                        val targetApptId = item.appointmentId ?: parsedMeta.trackingCode
                        val actionLabel = when (item.type) {
                            "queue_alert", "manual_alert", "doctor_arrival", "clinic_break" ->
                                if (!targetApptId.isNullOrBlank()) "Track Live Queue" else null
                            "lab_report" -> "View Lab Report"
                            else -> null
                        }

                        DactorTemplateNotificationCard(
                            item = item,
                            actionLabel = actionLabel,
                            onClick = {
                                notifications = notifications.map {
                                    if (it.id == item.id) it.copy(isRead = true) else it
                                }
                                coroutineScope.launch {
                                    try { notificationRepository?.markAsRead(item.id) } catch (_: Exception) {}
                                }
                                when (item.type) {
                                    "queue_alert", "manual_alert", "doctor_arrival", "clinic_break" -> {
                                        if (!targetApptId.isNullOrBlank()) {
                                            navController.navigate(NavRoutes.QueueStatus.createRoute(targetApptId))
                                        }
                                    }
                                    "lab_report" -> {
                                        val apptId = targetApptId ?: "all"
                                        navController.navigate(NavRoutes.LabReport.createRoute(apptId))
                                    }
                                    else -> {}
                                }
                            }
                        )
                    }
                }
            }
        }
    }
}

