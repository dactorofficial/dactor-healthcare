package com.dactor.clinic.ui.queue

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.repository.QueueRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AverageTimeScreen(
    navController: NavController,
    clinicId: String = "",
    queueRepository: QueueRepository? = null
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val sessionManager = remember { UserSessionManager(context) }
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else sessionManager.getSavedClinicId() ?: ""
    }

    var avgDetails by remember(effectiveClinicId) {
        mutableStateOf<QueueRepository.ClinicAverageCalculationResult?>(null)
    }
    var isLoading by remember { mutableStateOf(true) }
    var manualMinutesInput by remember { mutableStateOf("10") }
    var selectedMode by remember { mutableStateOf("auto") }
    var isSaving by remember { mutableStateOf(false) }
    var feedbackMessage by remember { mutableStateOf<String?>(null) }
    var isErrorFeedback by remember { mutableStateOf(false) }

    fun loadDetails(showLoadingIndicator: Boolean = true) {
        coroutineScope.launch {
            if (showLoadingIndicator) isLoading = true
            if (effectiveClinicId.isNotBlank() && queueRepository != null) {
                try {
                    val result = queueRepository.getClinicAverageTimeDetails(effectiveClinicId)
                    avgDetails = result
                    manualMinutesInput = result.manualAvgMinutes.toString()
                    selectedMode = result.mode
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
            isLoading = false
        }
    }

    LaunchedEffect(effectiveClinicId) {
        loadDetails()
    }

    fun saveSettings(targetMinutes: Int = manualMinutesInput.toIntOrNull() ?: 10, targetMode: String = selectedMode) {
        if (targetMinutes < 1 || targetMinutes > 180) {
            feedbackMessage = "Please enter an average time between 1 and 180 minutes."
            isErrorFeedback = true
            return
        }

        coroutineScope.launch {
            isSaving = true
            feedbackMessage = null
            try {
                val success = queueRepository?.updateClinicAverageTimePreference(
                    effectiveClinicId,
                    targetMinutes,
                    targetMode
                ) ?: false

                if (success) {
                    avgDetails = queueRepository?.getClinicAverageTimeDetails(effectiveClinicId)
                    selectedMode = targetMode
                    manualMinutesInput = targetMinutes.toString()
                    feedbackMessage = "Average consultation time successfully set to $targetMinutes mins ($targetMode mode)!"
                    isErrorFeedback = false
                } else {
                    feedbackMessage = "Unable to save average time. Please check your connection."
                    isErrorFeedback = true
                }
            } catch (e: Exception) {
                feedbackMessage = "Error updating settings: ${e.localizedMessage ?: "Unknown error"}"
                isErrorFeedback = true
            }
            isSaving = false
        }
    }

    Scaffold(
        containerColor = Color(0xFFF8FAFC),
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF006B7D),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Timer,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        Column {
                            Text(
                                "Average Time Engine",
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.5.sp,
                                color = Color(0xFF0F172A)
                            )
                            Text(
                                "Queue wait-time estimator",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = "Back",
                            tint = Color(0xFF0F172A)
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { loadDetails() }) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = Color(0xFF0F172A)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        val scrollState = rememberScrollState()

        val details = avgDetails
        val currentMode = selectedMode
        val manualMinutes = details?.manualAvgMinutes ?: (manualMinutesInput.toIntOrNull() ?: 10)
        val calculatedMinutes = details?.calculatedAvgMinutes
        val effectiveMinutes = details?.effectiveAvgMinutes ?: manualMinutes
        val completedVisits = details?.completedVisitsCount ?: 0
        val outliersOmitted = details?.outliersOmittedCount ?: 0
        val isReplaced = details?.isAutoReplaced == true

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Core Purpose Info Banner
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0xFFEBF3FE),
                border = BorderStroke(1.dp, Color(0xFFD7E7FD)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF3B82F6),
                        modifier = Modifier.size(32.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Info,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(
                            text = "Estimated Time Calculation",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = Color(0xFF0F172A)
                        )
                        Text(
                            text = "This engine powers estimated consultation times for patients in the Live OPD Queue. Each patient's expected turn is automatically calculated as: Effective Average Time × Patients ahead in line.",
                            fontSize = 12.sp,
                            color = Color(0xFF475569),
                            lineHeight = 16.5.sp
                        )
                    }
                }
            }

            // Feedback Alert if present
            if (feedbackMessage != null) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (isErrorFeedback) Color(0xFFFEE2E2) else Color(0xFFDCFCE7),
                    border = BorderStroke(1.dp, if (isErrorFeedback) Color(0xFFFECACA) else Color(0xFFBBF7D0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            if (isErrorFeedback) Icons.Default.Error else Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = if (isErrorFeedback) Color(0xFFDC2626) else Color(0xFF16A34A),
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = feedbackMessage.orEmpty(),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isErrorFeedback) Color(0xFF991B1B) else Color(0xFF15803D)
                        )
                    }
                }
            }

            // 2. Active Effective Average Hero Card
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFECFDF5),
                                modifier = Modifier.size(36.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.Speed,
                                        contentDescription = null,
                                        tint = Color(0xFF059669),
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                            Column {
                                Text(
                                    text = "Current Active Pacing",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B),
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "Live Queue Pace",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0F172A)
                                )
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFF006B7D)
                        ) {
                            Text(
                                text = "$effectiveMinutes mins / patient",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 13.5.sp,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }

                    HorizontalDivider(color = Color(0xFFF1F5F9))

                    // Side-by-Side Dual Analysis Cards
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Card 1: Configured (Manual) Time
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = if (currentMode == "manual") Color(0xFFEFF6FF) else Color(0xFFF8FAFC),
                            border = BorderStroke(
                                width = if (currentMode == "manual") 1.5.dp else 1.dp,
                                color = if (currentMode == "manual") Color(0xFF3B82F6) else Color(0xFFE2E8F0)
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .clickable {
                                    selectedMode = "manual"
                                    saveSettings(manualMinutes, "manual")
                                }
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Configured",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B),
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    if (currentMode == "manual") {
                                        Icon(
                                            Icons.Default.CheckCircle,
                                            contentDescription = null,
                                            tint = Color(0xFF3B82F6),
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = "$manualMinutes mins",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 17.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Clinic benchmark",
                                    fontSize = 10.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                        }

                        // Card 2: Data-Driven Calculated Time
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = if (currentMode == "calculated" || isReplaced) Color(0xFFECFDF5) else Color(0xFFF8FAFC),
                            border = BorderStroke(
                                width = if (currentMode == "calculated" || isReplaced) 1.5.dp else 1.dp,
                                color = if (currentMode == "calculated" || isReplaced) Color(0xFF10B981) else Color(0xFFE2E8F0)
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .clickable {
                                    if (calculatedMinutes != null) {
                                        selectedMode = "calculated"
                                        saveSettings(manualMinutes, "calculated")
                                    }
                                }
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Data-Calculated",
                                        fontSize = 11.sp,
                                        color = Color(0xFF64748B),
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    if (isReplaced) {
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = Color(0xFF10B981)
                                        ) {
                                            Text(
                                                text = "±5m active",
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color.White,
                                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                            )
                                        }
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = if (calculatedMinutes != null) "$calculatedMinutes mins" else "Collecting...",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 17.sp,
                                    color = if (calculatedMinutes != null) Color(0xFF065F46) else Color(0xFF64748B)
                                )
                                Text(
                                    text = if (completedVisits > 0) "$completedVisits visits • $outliersOmitted outliers" else "Requires past visits",
                                    fontSize = 10.sp,
                                    color = Color(0xFF94A3B8),
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }

            // 3. Calculation Algorithm Mode Selector
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "Active Algorithm Strategy",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.5.sp,
                        color = Color(0xFF0F172A)
                    )

                    // Mode 1: Auto (±5m Rule)
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (currentMode == "auto") Color(0xFFECFDF5) else Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, if (currentMode == "auto") Color(0xFF10B981) else Color(0xFFE2E8F0)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                selectedMode = "auto"
                                saveSettings(manualMinutes, "auto")
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            RadioButton(
                                selected = currentMode == "auto",
                                onClick = {
                                    selectedMode = "auto"
                                    saveSettings(manualMinutes, "auto")
                                },
                                colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF059669))
                            )
                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(
                                        text = "Auto (±5m Rule)",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Surface(
                                        shape = RoundedCornerShape(4.dp),
                                        color = Color(0xFF059669)
                                    ) {
                                        Text(
                                            text = "Recommended",
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color.White,
                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                        )
                                    }
                                }
                                Text(
                                    text = "Uses configured time as baseline. Automatically adopts data-calculated average when within ±5 minutes of target.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B),
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }

                    // Mode 2: Configured (Manual)
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (currentMode == "manual") Color(0xFFEFF6FF) else Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, if (currentMode == "manual") Color(0xFF3B82F6) else Color(0xFFE2E8F0)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                selectedMode = "manual"
                                saveSettings(manualMinutes, "manual")
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            RadioButton(
                                selected = currentMode == "manual",
                                onClick = {
                                    selectedMode = "manual"
                                    saveSettings(manualMinutes, "manual")
                                },
                                colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF2563EB))
                            )
                            Column {
                                Text(
                                    text = "Configured (Fixed Benchmark)",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Strictly enforces your specified average minutes regardless of consultation duration variations.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B),
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }

                    // Mode 3: Calculated
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (currentMode == "calculated") Color(0xFFF5F3FF) else Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, if (currentMode == "calculated") Color(0xFF7C3AED) else Color(0xFFE2E8F0)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = calculatedMinutes != null) {
                                selectedMode = "calculated"
                                saveSettings(manualMinutes, "calculated")
                            }
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            RadioButton(
                                selected = currentMode == "calculated",
                                onClick = {
                                    if (calculatedMinutes != null) {
                                        selectedMode = "calculated"
                                        saveSettings(manualMinutes, "calculated")
                                    }
                                },
                                enabled = calculatedMinutes != null,
                                colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF7C3AED))
                            )
                            Column {
                                Text(
                                    text = "Data-Calculated (Pure Statistical)",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = if (calculatedMinutes != null) Color(0xFF0F172A) else Color(0xFF94A3B8)
                                )
                                Text(
                                    text = if (calculatedMinutes != null) "Directly applies the calculated average of completed consultations with outlier trimming." else "Requires completed patient visits before mathematical calculation can be activated.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B),
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }
                }
            }

            // 4. Configure Benchmark Time Input Card
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = "Set Benchmark Consultation Duration",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.5.sp,
                        color = Color(0xFF0F172A)
                    )

                    OutlinedTextField(
                        value = manualMinutesInput,
                        onValueChange = {
                            if (it.all { ch -> ch.isDigit() } && it.length <= 3) {
                                manualMinutesInput = it
                            }
                        },
                        label = { Text("Average Duration (Minutes)") },
                        placeholder = { Text("10") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        leadingIcon = {
                            Icon(Icons.Default.AccessTime, contentDescription = null, tint = Color(0xFF006B7D))
                        },
                        trailingIcon = {
                            Text(
                                "mins",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp,
                                color = Color(0xFF64748B),
                                modifier = Modifier.padding(end = 12.dp)
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )

                    // Quick Preset Chips
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf(5, 10, 15, 20, 30).forEach { preset ->
                            val isCurrentPreset = manualMinutesInput == preset.toString()
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isCurrentPreset) Color(0xFF006B7D) else Color(0xFFF1F5F9),
                                border = BorderStroke(1.dp, if (isCurrentPreset) Color(0xFF006B7D) else Color(0xFFE2E8F0)),
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { manualMinutesInput = preset.toString() }
                            ) {
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier.padding(vertical = 8.dp)
                                ) {
                                    Text(
                                        text = "${preset}m",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = if (isCurrentPreset) Color.White else Color(0xFF334155)
                                    )
                                }
                            }
                        }
                    }

                    Button(
                        onClick = {
                            val mins = manualMinutesInput.toIntOrNull() ?: 10
                            saveSettings(mins, selectedMode)
                        },
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF006B7D)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        enabled = !isSaving
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                        } else {
                            Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            text = "Save & Apply Average Time",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }
                }
            }

            // 5. Live Simulation / Queue Pacing Demonstration
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            Icons.Default.Groups,
                            contentDescription = null,
                            tint = Color(0xFF0284C7),
                            modifier = Modifier.size(20.dp)
                        )
                        Text(
                            text = "Live Queue Projection Preview",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.5.sp,
                            color = Color(0xFF0F172A)
                        )
                    }

                    Text(
                        text = "With $effectiveMinutes mins/patient, upcoming turns are scheduled as:",
                        fontSize = 11.5.sp,
                        color = Color(0xFF64748B)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            Triple("Position #1", "In Turn", "Immediate"),
                            Triple("Position #2", "+${effectiveMinutes}m", "1 patient ahead"),
                            Triple("Position #3", "+${effectiveMinutes * 2}m", "2 patients ahead"),
                            Triple("Position #4", "+${effectiveMinutes * 3}m", "3 patients ahead")
                        ).forEach { (pos, wait, subtitle) ->
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                modifier = Modifier.weight(1f)
                            ) {
                                Column(
                                    modifier = Modifier.padding(8.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Text(pos, fontSize = 9.5.sp, color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                                    Text(wait, fontSize = 12.sp, color = Color(0xFF006B7D), fontWeight = FontWeight.Bold)
                                    Text(subtitle, fontSize = 8.5.sp, color = Color(0xFF94A3B8), textAlign = TextAlign.Center)
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
        }
    }
}
