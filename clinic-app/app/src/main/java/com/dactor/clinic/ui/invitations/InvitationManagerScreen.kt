package com.dactor.clinic.ui.invitations

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.dactor.clinic.data.local.UserSessionManager
import com.dactor.clinic.data.model.ClinicInvitation
import com.dactor.clinic.data.model.Doctor
import com.dactor.clinic.data.model.Profile
import com.dactor.clinic.data.repository.AuthRepository
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.data.repository.InvitationRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvitationManagerScreen(
    navController: NavController,
    clinicId: String = "",
    invitationRepository: InvitationRepository? = null,
    doctorRepository: DoctorRepository? = null,
    authRepository: AuthRepository? = null
) {
    val context = LocalContext.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val sessionManager = remember(context) { UserSessionManager(context) }
    val effectiveClinicId = remember(clinicId) {
        if (clinicId.isNotBlank() && clinicId != "c1") clinicId
        else sessionManager.getSavedClinicId() ?: ""
    }
    val clinicName = remember(context) {
        sessionManager.getSavedName()?.takeIf { it.isNotBlank() } ?: "Rosas O Es"
    }

    var selectedTab by remember { mutableIntStateOf(0) } // 0: Find & Invite Staff, 1: Sent Invitations
    var selectedRoleFilter by remember { mutableStateOf("All") } // "All", "Doctors", "Lab Technicians"
    var searchQuery by remember { mutableStateOf("") }
    var submittedSearchQuery by remember { mutableStateOf("") }

    var registeredDoctors by remember { mutableStateOf<List<Doctor>>(emptyList()) }
    var labTechProfiles by remember { mutableStateOf<List<Profile>>(emptyList()) }
    var sentInvitations by remember(effectiveClinicId) { mutableStateOf<List<ClinicInvitation>>(emptyList()) }

    var isLoading by remember { mutableStateOf(true) }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    var isOperating by remember { mutableStateOf(false) }

    // State for Doctor Profile Popup Modal
    var selectedDoctorForProfile by remember { mutableStateOf<Doctor?>(null) }
    var selectedLabTechForProfile by remember { mutableStateOf<Profile?>(null) }

    val coroutineScope = rememberCoroutineScope()

    suspend fun loadData() {
        isLoading = true
        if (doctorRepository != null) {
            registeredDoctors = doctorRepository.getAllDoctors()
        }
        if (invitationRepository != null) {
            labTechProfiles = invitationRepository.getLabTechnicianProfiles()
            if (effectiveClinicId.isNotBlank()) {
                sentInvitations = invitationRepository.getInvitations(effectiveClinicId)
            }
        }
        isLoading = false
    }

    LaunchedEffect(effectiveClinicId) {
        loadData()
    }

    // Filtered doctors
    val filteredDoctors = remember(registeredDoctors, submittedSearchQuery, selectedRoleFilter) {
        if (selectedRoleFilter == "Lab Technicians") {
            emptyList()
        } else {
            val q = submittedSearchQuery.trim().lowercase()
            if (q.isBlank()) {
                registeredDoctors
            } else {
                registeredDoctors.filter { doc ->
                    doc.fullName.lowercase().contains(q) ||
                    (doc.specialty ?: "").lowercase().contains(q) ||
                    doc.email.lowercase().contains(q) ||
                    (doc.nmcLicenseNumber ?: "").lowercase().contains(q) ||
                    (doc.education ?: "").lowercase().contains(q)
                }
            }
        }
    }

    // Filtered lab technicians
    val filteredLabTechs = remember(labTechProfiles, submittedSearchQuery, selectedRoleFilter) {
        if (selectedRoleFilter == "Doctors") {
            emptyList()
        } else {
            val q = submittedSearchQuery.trim().lowercase()
            if (q.isBlank()) {
                labTechProfiles
            } else {
                labTechProfiles.filter { tech ->
                    (tech.fullName ?: "").lowercase().contains(q) ||
                    tech.email.lowercase().contains(q)
                }
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFFF8FAFC),
                        Color(0xFFF1F5F9),
                        Color(0xFFE0F2FE).copy(alpha = 0.4f)
                    )
                )
            )
    ) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    // Top Clinic Pill Tag
                    Surface(
                        color = Color(0xFF0F4C81),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.padding(bottom = 6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Icon(
                                Icons.Default.LocalHospital,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = clinicName,
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    // Main Header Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            IconButton(
                                onClick = { navController.popBackStack() },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = "Back",
                                    tint = Color(0xFF0F172A),
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                            Column {
                                Text(
                                    text = "Doctor & Staff Invitations",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 19.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    text = "Search profiles and invite directly to accounts",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }

                        // Circular Refresh Button
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier
                                .size(38.dp)
                                .clickable {
                                    coroutineScope.launch { loadData() }
                                }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Refresh,
                                    contentDescription = "Refresh",
                                    tint = Color(0xFF475569),
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Action Feedback Banner
                if (actionMessage != null) {
                    Surface(
                        color = Color(0xFFDCFCE7),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFF86EFAC)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF15803D),
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = actionMessage ?: "",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF166534),
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { actionMessage = null },
                                modifier = Modifier.size(22.dp)
                            ) {
                                Icon(
                                    Icons.Default.Close,
                                    contentDescription = "Dismiss",
                                    tint = Color(0xFF166534),
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }

                // Segmented Tabs Matching Template
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.White.copy(alpha = 0.95f),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    shadowElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        // Tab 0: Find & Invite Staff
                        val isTab0 = selectedTab == 0
                        Surface(
                            onClick = { selectedTab = 0 },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isTab0) Color(0xFFE0F2FE) else Color.Transparent,
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(vertical = 10.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        Icons.Default.PersonAdd,
                                        contentDescription = null,
                                        tint = if (isTab0) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Text(
                                        text = "Find & Invite Staff (${registeredDoctors.size + labTechProfiles.size})",
                                        fontWeight = if (isTab0) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 12.5.sp,
                                        color = if (isTab0) Color(0xFF00838F) else Color(0xFF64748B)
                                    )
                                }
                                if (isTab0) {
                                    Spacer(Modifier.height(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .width(70.dp)
                                            .height(2.5.dp)
                                            .background(Color(0xFF0097A7), RoundedCornerShape(2.dp))
                                    )
                                }
                            }
                        }

                        // Tab 1: Sent Invitations
                        val isTab1 = selectedTab == 1
                        Surface(
                            onClick = { selectedTab = 1 },
                            shape = RoundedCornerShape(12.dp),
                            color = if (isTab1) Color(0xFFE0F2FE) else Color.Transparent,
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(vertical = 10.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Send,
                                        contentDescription = null,
                                        tint = if (isTab1) Color(0xFF0097A7) else Color(0xFF64748B),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Sent Invitations (${sentInvitations.size})",
                                        fontWeight = if (isTab1) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 12.5.sp,
                                        color = if (isTab1) Color(0xFF00838F) else Color(0xFF64748B)
                                    )
                                }
                                if (isTab1) {
                                    Spacer(Modifier.height(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .width(60.dp)
                                            .height(2.5.dp)
                                            .background(Color(0xFF0097A7), RoundedCornerShape(2.dp))
                                    )
                                }
                            }
                        }
                    }
                }

                if (selectedTab == 0) {
                    // TAB 0: SEARCH & PROFILES
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Search Bar Card with Embedded Search Button
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = Color.White,
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            shadowElevation = 2.dp,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    Icons.Default.Search,
                                    contentDescription = null,
                                    tint = Color(0xFF0097A7),
                                    modifier = Modifier.size(22.dp)
                                )

                                OutlinedTextField(
                                    value = searchQuery,
                                    onValueChange = {
                                        searchQuery = it
                                        submittedSearchQuery = it
                                    },
                                    placeholder = {
                                        Text(
                                            "Search doctor by\nname, specialty, NMC...",
                                            fontSize = 12.5.sp,
                                            color = Color(0xFF94A3B8),
                                            lineHeight = 15.sp
                                        )
                                    },
                                    trailingIcon = {
                                        if (searchQuery.isNotBlank()) {
                                            IconButton(
                                                onClick = {
                                                    searchQuery = ""
                                                    submittedSearchQuery = ""
                                                },
                                                modifier = Modifier.size(24.dp)
                                            ) {
                                                Icon(
                                                    Icons.Default.Clear,
                                                    contentDescription = "Clear",
                                                    tint = Color(0xFF64748B),
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                        }
                                    },
                                    singleLine = false,
                                    maxLines = 2,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color.Transparent,
                                        unfocusedBorderColor = Color.Transparent,
                                        cursorColor = Color(0xFF0097A7)
                                    ),
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                    keyboardActions = KeyboardActions(onSearch = {
                                        submittedSearchQuery = searchQuery
                                        keyboardController?.hide()
                                    }),
                                    modifier = Modifier.weight(1f)
                                )

                                // Dedicated Teal Search Button Matching Template
                                Button(
                                    onClick = {
                                        submittedSearchQuery = searchQuery
                                        keyboardController?.hide()
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                                    shape = RoundedCornerShape(12.dp),
                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                                    modifier = Modifier.height(44.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Search,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                        tint = Color.White
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    Text(
                                        "Search",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color.White
                                    )
                                }
                            }
                        }

                        // Category Filter Chips Matching Template
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            listOf("All", "Doctors", "Lab Technicians").forEach { role ->
                                val isSelected = selectedRoleFilter == role
                                Surface(
                                    onClick = { selectedRoleFilter = role },
                                    shape = RoundedCornerShape(14.dp),
                                    color = if (isSelected) Color(0xFFD6F0FA) else Color.White,
                                    border = BorderStroke(
                                        1.dp,
                                        if (isSelected) Color(0xFFBAE6FD) else Color(0xFFCBD5E1)
                                    ),
                                    modifier = Modifier.height(36.dp)
                                ) {
                                    Box(
                                        contentAlignment = Alignment.Center,
                                        modifier = Modifier.padding(horizontal = 18.dp)
                                    ) {
                                        Text(
                                            text = role,
                                            fontSize = 12.5.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                            color = if (isSelected) Color(0xFF0284C7) else Color(0xFF475569)
                                        )
                                    }
                                }
                            }
                        }

                        if (isLoading) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(color = Color(0xFF0097A7))
                            }
                        } else if (filteredDoctors.isEmpty() && filteredLabTechs.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f)
                                    .padding(vertical = 40.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Icon(
                                        Icons.Default.PersonSearch,
                                        contentDescription = null,
                                        tint = Color(0xFF94A3B8),
                                        modifier = Modifier.size(54.dp)
                                    )
                                    Text(
                                        text = if (submittedSearchQuery.isNotBlank()) "No profiles matching '$submittedSearchQuery'" else "No Registered Doctor Profiles Found",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    Text(
                                        text = "Doctors who register in the Doctor Portal will appear here for one-tap direct invitation.",
                                        fontSize = 12.sp,
                                        color = Color(0xFF64748B),
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier.padding(horizontal = 24.dp)
                                    )
                                    if (submittedSearchQuery.isNotBlank()) {
                                        OutlinedButton(
                                            onClick = {
                                                searchQuery = ""
                                                submittedSearchQuery = ""
                                            },
                                            shape = RoundedCornerShape(8.dp)
                                        ) {
                                            Text("Reset Search")
                                        }
                                    }
                                }
                            }
                        } else {
                            LazyColumn(
                                verticalArrangement = Arrangement.spacedBy(14.dp),
                                contentPadding = PaddingValues(bottom = 24.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f)
                            ) {
                                // DOCTOR CARDS
                                items(filteredDoctors, key = { it.id }) { doc ->
                                    val existingInvite = sentInvitations.find { it.email.equals(doc.email, ignoreCase = true) }
                                    val isAccepted = existingInvite?.status.equals("accepted", ignoreCase = true) || doc.clinicId == effectiveClinicId
                                    val isPending = !isAccepted && existingInvite?.status.equals("pending", ignoreCase = true)
                                    val isDeclined = !isAccepted && existingInvite?.status.equals("rejected", ignoreCase = true)

                                    DoctorCardItem(
                                        doctor = doc,
                                        isAccepted = isAccepted,
                                        isPending = isPending,
                                        isDeclined = isDeclined,
                                        onCardClick = {
                                            // Open Full Profile Popup Modal
                                            selectedDoctorForProfile = doc
                                        },
                                        onInviteClick = {
                                            coroutineScope.launch {
                                                isOperating = true
                                                if (invitationRepository != null && effectiveClinicId.isNotBlank()) {
                                                    val created = invitationRepository.sendInvitation(effectiveClinicId, doc.email, "doctor")
                                                    if (created != null) {
                                                        actionMessage = "✓ Invitation sent directly to ${doc.fullName}'s account!"
                                                        loadData()
                                                    } else {
                                                        actionMessage = "Failed to send invitation. Please try again."
                                                    }
                                                }
                                                isOperating = false
                                            }
                                        }
                                    )
                                }

                                // LAB TECHNICIAN CARDS
                                items(filteredLabTechs, key = { it.id }) { tech ->
                                    val existingInvite = sentInvitations.find { it.email.equals(tech.email, ignoreCase = true) }
                                    val isAccepted = existingInvite?.status.equals("accepted", ignoreCase = true)
                                    val isPending = !isAccepted && existingInvite?.status.equals("pending", ignoreCase = true)

                                    LabTechnicianCardItem(
                                        tech = tech,
                                        isAccepted = isAccepted,
                                        isPending = isPending,
                                        onCardClick = {
                                            selectedLabTechForProfile = tech
                                        },
                                        onInviteClick = {
                                            coroutineScope.launch {
                                                isOperating = true
                                                if (invitationRepository != null && effectiveClinicId.isNotBlank()) {
                                                    val created = invitationRepository.sendInvitation(effectiveClinicId, tech.email, "lab_technician")
                                                    if (created != null) {
                                                        actionMessage = "✓ Invitation sent to ${tech.fullName ?: tech.email}'s account!"
                                                        loadData()
                                                    }
                                                }
                                                isOperating = false
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    }
                } else {
                    // TAB 1: SENT INVITATIONS
                    if (sentInvitations.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(bottom = 60.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    Icons.Default.MarkEmailRead,
                                    contentDescription = null,
                                    tint = Color(0xFF94A3B8),
                                    modifier = Modifier.size(48.dp)
                                )
                                Text(
                                    "No Invitations Dispatched Yet",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = Color(0xFF0F172A)
                                )
                                Text(
                                    "Switch to 'Find & Invite Staff' tab above to search doctor profiles.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            contentPadding = PaddingValues(bottom = 24.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(sentInvitations, key = { it.id }) { invite ->
                                Card(
                                    shape = RoundedCornerShape(16.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color.White),
                                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .padding(16.dp)
                                            .fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = invite.email,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 14.sp,
                                                color = Color(0xFF0F172A)
                                            )
                                            Text(
                                                text = "Role: ${if (invite.role == "doctor") "Doctor (Physician)" else "Lab Technician"}",
                                                fontSize = 12.sp,
                                                color = Color(0xFF64748B),
                                                modifier = Modifier.padding(top = 2.dp)
                                            )
                                            Text(
                                                text = if (invite.status == "accepted")
                                                    "✓ Affiliated to Clinic (Can publish slots)"
                                                else if (invite.status == "rejected")
                                                    "✕ Declined by Doctor"
                                                else
                                                    "⏳ Awaiting Doctor Acceptance in Doctor Portal",
                                                fontSize = 11.sp,
                                                color = if (invite.status == "accepted") Color(0xFF047857) else if (invite.status == "rejected") Color.Red else Color(0xFFD97706),
                                                fontWeight = FontWeight.Medium,
                                                modifier = Modifier.padding(top = 2.dp)
                                            )
                                        }

                                        if (invite.status == "rejected") {
                                            OutlinedButton(
                                                onClick = {
                                                    coroutineScope.launch {
                                                        if (invitationRepository != null) {
                                                            invitationRepository.sendInvitation(effectiveClinicId, invite.email, invite.role)
                                                            actionMessage = "✓ Invitation re-sent to ${invite.email}!"
                                                            loadData()
                                                        }
                                                    }
                                                },
                                                shape = RoundedCornerShape(8.dp),
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                                modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                                            ) {
                                                Text("Re-Invite", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }
                                        } else if (invite.status == "pending") {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Surface(
                                                    color = Color(0xFFFEF3C7),
                                                    shape = RoundedCornerShape(8.dp)
                                                ) {
                                                    Text(
                                                        text = "Pending",
                                                        color = Color(0xFF92400E),
                                                        fontSize = 11.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                    )
                                                }
                                                OutlinedButton(
                                                    onClick = {
                                                        coroutineScope.launch {
                                                            isOperating = true
                                                            invitationRepository?.cancelInvitation(invite.id)
                                                            actionMessage = "Invitation cancelled."
                                                            loadData()
                                                            isOperating = false
                                                        }
                                                    },
                                                    shape = RoundedCornerShape(8.dp),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                                    modifier = Modifier.defaultMinSize(minHeight = 32.dp)
                                                ) {
                                                    Text("Cancel", fontSize = 11.sp)
                                                }
                                            }
                                        } else {
                                            Surface(
                                                color = Color(0xFFD1FAE5),
                                                shape = RoundedCornerShape(8.dp)
                                            ) {
                                                Text(
                                                    text = "Affiliated",
                                                    color = Color(0xFF065F46),
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================
        // DOCTOR PROFILE POPUP MODAL (PROFESSIONAL & NON-CONFIDENTIAL)
        // With Cancel Button & Invite Option (if not added)
        // ==========================================
        selectedDoctorForProfile?.let { doctor ->
            val existingInvite = sentInvitations.find { it.email.equals(doctor.email, ignoreCase = true) }
            val isAccepted = existingInvite?.status.equals("accepted", ignoreCase = true) || doctor.clinicId == effectiveClinicId
            val isPending = !isAccepted && existingInvite?.status.equals("pending", ignoreCase = true)

            DoctorProfileModalDialog(
                doctor = doctor,
                isAccepted = isAccepted,
                isPending = isPending,
                onDismiss = {
                    selectedDoctorForProfile = null
                },
                onInvite = {
                    coroutineScope.launch {
                        isOperating = true
                        if (invitationRepository != null && effectiveClinicId.isNotBlank()) {
                            val created = invitationRepository.sendInvitation(effectiveClinicId, doctor.email, "doctor")
                            if (created != null) {
                                actionMessage = "✓ Invitation sent directly to ${doctor.fullName}'s account!"
                                loadData()
                            } else {
                                actionMessage = "Failed to send invitation. Please try again."
                            }
                        }
                        isOperating = false
                        selectedDoctorForProfile = null
                    }
                }
            )
        }

        // Lab Tech Profile Modal
        selectedLabTechForProfile?.let { tech ->
            val existingInvite = sentInvitations.find { it.email.equals(tech.email, ignoreCase = true) }
            val isAccepted = existingInvite?.status.equals("accepted", ignoreCase = true)
            val isPending = !isAccepted && existingInvite?.status.equals("pending", ignoreCase = true)

            LabTechProfileModalDialog(
                tech = tech,
                isAccepted = isAccepted,
                isPending = isPending,
                onDismiss = {
                    selectedLabTechForProfile = null
                },
                onInvite = {
                    coroutineScope.launch {
                        isOperating = true
                        if (invitationRepository != null && effectiveClinicId.isNotBlank()) {
                            val created = invitationRepository.sendInvitation(effectiveClinicId, tech.email, "lab_technician")
                            if (created != null) {
                                actionMessage = "✓ Invitation sent to ${tech.fullName ?: tech.email}!"
                                loadData()
                            }
                        }
                        isOperating = false
                        selectedLabTechForProfile = null
                    }
                }
            )
        }
    }
}

/**
 * Doctor Card Item strictly adhering to the template in media_1791613724384_dcc496c5.png
 */
@Composable
private fun DoctorCardItem(
    doctor: Doctor,
    isAccepted: Boolean,
    isPending: Boolean,
    isDeclined: Boolean,
    onCardClick: () -> Unit,
    onInviteClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Upper Row: Avatar, Info, Status / Invite
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Profile Photo with Online Indicator Dot
                    Box(modifier = Modifier.size(64.dp)) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFFD0EEFB),
                            modifier = Modifier.size(64.dp)
                        ) {
                            if (!doctor.resolvedProfilePictureUrl.isNullOrBlank()) {
                                AsyncImage(
                                    model = doctor.resolvedProfilePictureUrl,
                                    contentDescription = doctor.fullName,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(CircleShape)
                                )
                            } else {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.MedicalServices,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(32.dp)
                                    )
                                }
                            }
                        }

                        // Online green dot
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .size(16.dp)
                                .background(Color.White, CircleShape)
                                .padding(2.dp)
                                .background(Color(0xFF10B981), CircleShape)
                        )
                    }

                    // Doctor Details Column
                    Column(
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = doctor.fullName,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Color(0xFF0F172A),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Icon(
                                Icons.Default.Verified,
                                contentDescription = "Verified",
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        Text(
                            text = "${doctor.specialty ?: "General Physician"} • NMC: ${doctor.nmcLicenseNumber ?: "N/A"}",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )

                        // Qualification & Specialty Tag Pills
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            val degreeText = doctor.education?.split(",")?.firstOrNull()?.trim() ?: "MBBS"
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFFE0F2FE)
                            ) {
                                Text(
                                    text = degreeText,
                                    color = Color(0xFF0284C7),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }

                            val specialtyTag = doctor.specialty?.ifBlank { "General Physician" } ?: "General Physician"
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color(0xFFE0F2FE)
                            ) {
                                Text(
                                    text = specialtyTag,
                                    color = Color(0xFF0284C7),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        // Email Row
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            Icon(
                                Icons.Default.MailOutline,
                                contentDescription = null,
                                tint = Color(0xFF64748B),
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = doctor.email,
                                fontSize = 11.5.sp,
                                color = Color(0xFF64748B),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                // Top-Right Status or + Invite Button
                if (isAccepted) {
                    Surface(
                        color = Color(0xFFDCFCE7),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                tint = Color(0xFF15803D),
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = "Accepted",
                                color = Color(0xFF15803D),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                } else if (isPending) {
                    Surface(
                        color = Color(0xFFFEF3C7),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = "⏳ Pending",
                            color = Color(0xFF92400E),
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                } else {
                    // Not added: "+ Invite" direct button
                    Surface(
                        color = Color(0xFF0097A7),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.clickable { onInviteClick() }
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        ) {
                            Icon(
                                Icons.Default.Add,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = if (isDeclined) "Re-Invite" else "Invite",
                                color = Color.White,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // Bottom Info Bar Matching Template
            Surface(
                color = Color(0xFFF0F9FF),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {

                    // Middle Roster Status Pill
                    if (isAccepted) {
                        Surface(
                            color = Color(0xFFDCFCE7),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF16A34A),
                                    modifier = Modifier.size(13.dp)
                                )
                                Text(
                                    text = "Accepted • Active on Clinic Roster",
                                    color = Color(0xFF15803D),
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    } else if (isPending) {
                        Surface(
                            color = Color(0xFFFEF3C7),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Icon(
                                    Icons.Default.HourglassTop,
                                    contentDescription = null,
                                    tint = Color(0xFFD97706),
                                    modifier = Modifier.size(12.dp)
                                )
                                Text(
                                    text = "Pending • Awaiting Response",
                                    color = Color(0xFF92400E),
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    } else {
                        Surface(
                            color = Color(0xFFE2E8F0),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                text = "Not on Clinic Roster",
                                color = Color(0xFF475569),
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }

                    // Right Chevron Icon for Full Profile Popup
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFBAE6FD).copy(alpha = 0.6f),
                        modifier = Modifier
                            .size(28.dp)
                            .clickable { onCardClick() }
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.ChevronRight,
                                contentDescription = "View Profile",
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Lab Technician Card Item matching overall aesthetic
 */
@Composable
private fun LabTechnicianCardItem(
    tech: Profile,
    isAccepted: Boolean,
    isPending: Boolean,
    onCardClick: () -> Unit,
    onInviteClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f)
            ) {
                Surface(
                    shape = CircleShape,
                    color = Color(0xFF6366F1),
                    modifier = Modifier.size(54.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.Biotech,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = tech.fullName ?: "Lab Technician",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = "Role: Diagnostic Lab Technician",
                        fontSize = 12.sp,
                        color = Color(0xFF64748B)
                    )
                    Text(
                        text = "Account: ${tech.email}",
                        fontSize = 11.5.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }

            if (isAccepted) {
                Surface(
                    color = Color(0xFFDCFCE7),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "Affiliated",
                        color = Color(0xFF15803D),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            } else if (isPending) {
                Surface(
                    color = Color(0xFFFEF3C7),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "Pending",
                        color = Color(0xFF92400E),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            } else {
                Button(
                    onClick = { onInviteClick() },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                    modifier = Modifier.defaultMinSize(minHeight = 36.dp)
                ) {
                    Text("Invite", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }
            }
        }
    }
}

/**
 * Professional Full Profile Modal Dialog for Doctors
 * Strictly displays non-confidential details (Name, Specialty, NMC, Qualifications, Fee, Experience, Public Inquiry Contact, Bio)
 * Contains Cancel Button and Invite Option if doctor is not yet on the clinic roster.
 */
@Composable
private fun DoctorProfileModalDialog(
    doctor: Doctor,
    isAccepted: Boolean,
    isPending: Boolean,
    onDismiss: () -> Unit,
    onInvite: () -> Unit
) {
    val experienceYears = remember(doctor.startingPracticingYear) {
        val startYear = doctor.startingPracticingYear
        if (startYear != null && startYear in 1950..2026) {
            val diff = 2026 - startYear
            "${if (diff <= 0) 1 else diff}+ Years"
        } else {
            "Experienced"
        }
    }

    Dialog(
        onDismissRequest = { onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            shadowElevation = 8.dp,
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .fillMaxHeight(0.85f)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp)
            ) {
                // Modal Top Bar: Verified Badge + Close (Cancel) Icon Button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        color = Color(0xFFE0F2FE),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                Icons.Default.Verified,
                                contentDescription = null,
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "Verified Medical Specialist",
                                color = Color(0xFF0284C7),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    IconButton(
                        onClick = { onDismiss() },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Cancel & Close",
                            tint = Color(0xFF64748B),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Spacer(Modifier.height(8.dp))

                // Scrollable Content
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Doctor Hero Center: Avatar, Name, Specialty, NMC
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Box(modifier = Modifier.size(80.dp)) {
                            Surface(
                                shape = CircleShape,
                                color = Color(0xFFD0EEFB),
                                border = BorderStroke(2.dp, Color(0xFFBAE6FD)),
                                modifier = Modifier.size(80.dp)
                            ) {
                                if (!doctor.resolvedProfilePictureUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = doctor.resolvedProfilePictureUrl,
                                        contentDescription = doctor.fullName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .clip(CircleShape)
                                    )
                                } else {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.MedicalServices,
                                            contentDescription = null,
                                            tint = Color(0xFF0284C7),
                                            modifier = Modifier.size(40.dp)
                                        )
                                    }
                                }
                            }

                            // Green online dot
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(18.dp)
                                    .background(Color.White, CircleShape)
                                    .padding(2.dp)
                                    .background(Color(0xFF10B981), CircleShape)
                            )
                        }

                        Spacer(Modifier.height(10.dp))

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = doctor.fullName,
                                fontWeight = FontWeight.Bold,
                                fontSize = 20.sp,
                                color = Color(0xFF0F172A)
                            )
                            Icon(
                                Icons.Default.Verified,
                                contentDescription = "Verified",
                                tint = Color(0xFF0284C7),
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        Text(
                            text = doctor.specialty ?: "General Practice Physician",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF0284C7),
                            modifier = Modifier.padding(top = 2.dp)
                        )

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFF1F5F9),
                            modifier = Modifier.padding(top = 6.dp)
                        ) {
                            Text(
                                text = "NMC Reg. License: ${doctor.nmcLicenseNumber ?: "8866"}",
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF475569),
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }

                    // Key Professional Metric Badges (Experience, Fee, Status)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFF8FAFC),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("Experience", fontSize = 11.sp, color = Color(0xFF64748B))
                                Spacer(Modifier.height(2.dp))
                                Text(experienceYears, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F172A))
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFF8FAFC),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("OPD Fee", fontSize = 11.sp, color = Color(0xFF64748B))
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = if (isAccepted) "Rs. ${(doctor.consultationFee ?: 500.0).toInt()}" else "Set by Clinic",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0F172A)
                                )
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = Color(0xFFF8FAFC),
                            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(10.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("Clinic Status", fontSize = 11.sp, color = Color(0xFF64748B))
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = if (isAccepted) "Accepted" else if (isPending) "Invited" else "Available",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isAccepted) Color(0xFF15803D) else if (isPending) Color(0xFFD97706) else Color(0xFF0284C7)
                                )
                            }
                        }
                    }

                    // Degrees & Education
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.School, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(16.dp))
                                Text("Degrees & Medical Credentials", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0F172A))
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = doctor.education ?: "MBBS, MD - Specialization in Internal Medicine",
                                fontSize = 12.5.sp,
                                color = Color(0xFF475569)
                            )
                        }
                    }

                    // Professional Bio / Description
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.WorkHistory, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(16.dp))
                                Text("Clinical Background & Practice", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0F172A))
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = doctor.description?.takeIf { it.isNotBlank() }
                                    ?: "Dedicated clinical practitioner experienced in comprehensive diagnosis, outpatient care, chronic care management, and preventative patient wellness.",
                                fontSize = 12.sp,
                                color = Color(0xFF475569),
                                lineHeight = 17.sp
                            )
                        }
                    }

                    // Non-Confidential Official Contact
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFFF8FAFC),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.Badge, contentDescription = null, tint = Color(0xFF0284C7), modifier = Modifier.size(16.dp))
                                Text("Professional Communication Desk", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF0F172A))
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(Icons.Default.Email, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(14.dp))
                                Text("Professional Email: ${doctor.email}", fontSize = 12.sp, color = Color(0xFF475569))
                            }
                            if (!doctor.publicMobileNumber.isNullOrBlank()) {
                                Spacer(Modifier.height(4.dp))
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(14.dp))
                                    Text("Public Inquiry Desk: ${doctor.publicMobileNumber}", fontSize = 12.sp, color = Color(0xFF475569))
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Action Buttons Row: Cancel Button & Invite Option (if doctor is not added in clinic)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Cancel Button: Always present to dismiss the popup
                    OutlinedButton(
                        onClick = { onDismiss() },
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFFCBD5E1)),
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp)
                    ) {
                        Text(
                            text = "Cancel",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp,
                            color = Color(0xFF475569)
                        )
                    }

                    // If Doctor is NOT added in the clinic, add Invite option
                    if (!isAccepted && !isPending) {
                        Button(
                            onClick = { onInvite() },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1.3f)
                                .height(46.dp)
                        ) {
                            Icon(
                                Icons.Default.Add,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = "Invite to Clinic",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp,
                                color = Color.White
                            )
                        }
                    } else if (isPending) {
                        Surface(
                            color = Color(0xFFFEF3C7),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1.3f)
                                .height(46.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.HourglassTop,
                                        contentDescription = null,
                                        tint = Color(0xFF92400E),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = "Invited (Pending)",
                                        color = Color(0xFF92400E),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }
                    } else {
                        // Already accepted
                        Surface(
                            color = Color(0xFFDCFCE7),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1.3f)
                                .height(46.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = Color(0xFF15803D),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = "Active on Roster",
                                        color = Color(0xFF15803D),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Lab Technician Profile Modal Dialog
 */
@Composable
private fun LabTechProfileModalDialog(
    tech: Profile,
    isAccepted: Boolean,
    isPending: Boolean,
    onDismiss: () -> Unit,
    onInvite: () -> Unit
) {
    Dialog(
        onDismissRequest = { onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            shadowElevation = 8.dp,
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .fillMaxHeight(0.65f)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Diagnostic Staff Profile",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF0F172A)
                    )
                    IconButton(
                        onClick = { onDismiss() },
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Cancel & Close",
                            tint = Color(0xFF64748B),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF6366F1),
                        modifier = Modifier.size(70.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Biotech,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(36.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = tech.fullName ?: "Lab Technician",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = Color(0xFF0F172A)
                    )
                    Text(
                        text = "Diagnostic Clinical Technician",
                        fontSize = 13.sp,
                        color = Color(0xFF6366F1),
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = tech.email,
                        fontSize = 12.sp,
                        color = Color(0xFF64748B),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFF8FAFC),
                    border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("Affiliation Status", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFF0F172A))
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = if (isAccepted) "✓ Affiliated to clinic diagnostic team" else if (isPending) "⏳ Pending clinic invitation" else "Available for invitation",
                            fontSize = 12.sp,
                            color = if (isAccepted) Color(0xFF15803D) else if (isPending) Color(0xFFD97706) else Color(0xFF475569)
                        )
                    }
                }

                Spacer(Modifier.weight(1f))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = { onDismiss() },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(44.dp)
                    ) {
                        Text("Cancel", color = Color(0xFF475569))
                    }

                    if (!isAccepted && !isPending) {
                        Button(
                            onClick = { onInvite() },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0097A7)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .weight(1.2f)
                                .height(44.dp)
                        ) {
                            Text("Invite Staff", fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }
                }
            }
        }
    }
}
