package com.dactor.clinic.ui.legal

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import android.content.Intent
import android.net.Uri
import android.widget.Toast

@Composable
fun ClinicTermsAndConditionsDialog(
    initialTab: Int = 0, // 0: Clinic Facility, 1: Doctor / NMC, 2: Nepal & Google Play Laws
    isMandatory: Boolean = false,
    onAccept: (() -> Unit)? = null,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var selectedSection by remember { mutableIntStateOf(initialTab) }
    var isAgreed by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = {
            if (!isMandatory) onDismiss()
        },
        properties = DialogProperties(
            dismissOnBackPress = !isMandatory,
            dismissOnClickOutside = !isMandatory
        ),
        icon = {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(52.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        when (selectedSection) {
                            0 -> Icons.Default.LocalHospital
                            1 -> Icons.Default.MedicalServices
                            else -> Icons.Default.Gavel
                        },
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }
        },
        title = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    "Terms of Service & Regulatory Policy",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "Compliant with Nepal Healthcare Laws & Google Play Developer Policies",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Section Tabs
                ScrollableTabRow(
                    selectedTabIndex = selectedSection,
                    edgePadding = 0.dp,
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Tab(
                        selected = selectedSection == 0,
                        onClick = { selectedSection = 0 },
                        text = { Text("Clinic Facility", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                    )
                    Tab(
                        selected = selectedSection == 1,
                        onClick = { selectedSection = 1 },
                        text = { Text("Doctor & NMC", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                    )
                    Tab(
                        selected = selectedSection == 2,
                        onClick = { selectedSection = 2 },
                        text = { Text("Nepal & Play Policy", fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                    )
                }

                // Scrollable Content
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    when (selectedSection) {
                        0 -> {
                            // Section: Clinic Facility Operations
                            ClinicSectionCard(
                                title = "1. Clinic Facility Registration & OPD Token Governance",
                                body = "All registered clinics, polyclinics, diagnostic laboratories, and hospital OPDs operate in compliance with Nepal Ministry of Health & Population (MoHP) guidelines. Clinics must publish transparent consultation hours, accurate doctor rosters, and truthful queue availability. Digital tokens generated via Dactor are recognized as electronic registration slips under Nepal's Electronic Transactions Act 2063."
                            )
                            ClinicSectionCard(
                                title = "2. What We Do With Clinic & Patient Data",
                                body = "• Data Collected: Clinic registration information, PAN/tax details, staff emails, optional Google Sign-In profile (name, email, avatar), doctor schedules, patient appointment tokens, diagnostic lab test catalogs, and uploaded lab report documents.\n" +
                                        "• Use of Data: Used strictly for clinic operations, real-time queue synchronization, verified lab report delivery, invoicing, and high-priority patient push notifications.\n" +
                                        "• Zero Third-Party Selling: Dactor never sells, rents, or monetizes clinic or patient records to third-party marketing companies."
                            )
                            ClinicSectionCard(
                                title = "3. Emergency Protocol & Outpatient Distinction (Call 102)",
                                body = "Dactor provides outpatient queue management and non-emergency appointments. Healthcare facilities must maintain their independent emergency protocol. In acute life-threatening situations, patients must be directed immediately to hospital emergency casualty or Nepal Ambulance Service (102)."
                            )
                            ClinicSectionCard(
                                title = "4. Early Arrival Offers & Real-Time Push Alerts",
                                body = "When a doctor is free ahead of schedule and the next patient's slot is later, clinic staff may dispatch an 'Early Arrival' push notification ONLY to patients who explicitly opted into early calls during booking. Patients who did not opt in retain their scheduled slot time without disturbance."
                            )
                            ClinicSectionCard(
                                title = "5. 3-Stage Diagnostic Lab Pipeline & Verified Uploads",
                                body = "Diagnostic laboratories agree to maintain truthful 3-stage status updates: (1) Sample Collected, (2) Processing in Lab, and (3) Prepared & Uploaded. Uploaded pathology reports must be legitimate documents verified by a certified lab technician or pathologist."
                            )
                        }
                        1 -> {
                            // Section: Doctor & NMC Licensure
                            ClinicSectionCard(
                                title = "1. Nepal Medical Council (NMC) Licensure Requirement",
                                body = "All medical practitioners utilizing Dactor must hold an active, valid registration with the Nepal Medical Council (NMC) under the Nepal Medical Council Act 2020. Dactor does NOT employ doctors or dictate clinical practice. All medical decisions, prescriptions, and diagnoses remain the sole professional responsibility of the attending licensed doctor."
                            )
                            ClinicSectionCard(
                                title = "2. In-Clinic Physical Presence & Real-Time Availability",
                                body = "Doctors agree to maintain accurate physical presence status ('Doctor in Cabin' / 'Doctor Away'). Turning on physical presence informs patients that live consultations are in progress. Deliberate misrepresentation of doctor presence is prohibited."
                            )
                            ClinicSectionCard(
                                title = "3. Consultation Fee Transparency in NPR",
                                body = "All doctor consultation fees, OPD charges, and test prices must be published transparently in Nepalese Rupees (NPR). Secret markups or undisclosed surcharges violate Nepal Consumer Protection Act 2075."
                            )
                            ClinicSectionCard(
                                title = "4. Patient Confidentiality & Code of Medical Ethics",
                                body = "Practitioners are bound by the Nepal Medical Council Code of Ethics and Nepal Privacy Act 2075. Patient history, clinical notes, and diagnostic records viewed in the consultation desk must remain strictly confidential."
                            )
                        }
                        else -> {
                            // Section: Nepal Laws & Google Play Developer Policy
                            ClinicSectionCard(
                                title = "1. Electronic Transactions Act 2063 & NRB Digital Payments",
                                body = "Digital tokens, appointment confirmations, and electronic receipts generated on Dactor carry electronic legal validity under Nepal's Electronic Transactions Act 2063 (2008). Payment processing adheres to Nepal Rastra Bank (NRB) digital payment bylaws."
                            )
                            ClinicSectionCard(
                                title = "2. Nepal Individual Privacy Act 2075 & Data Protection",
                                body = "All personal identifying information (PII), phone numbers, tax identification, and health data collected are processed strictly under lawful consent with TLS 1.3 encryption. Users retain the legal right to data access, correction, and permanent deletion."
                            )
                            ClinicSectionCard(
                                title = "3. Google Play Store Health Apps Policy Compliance",
                                body = "Dactor complies with Google Play Health Apps Policies. This platform is an administrative practice management and appointment scheduling service. It does NOT provide automated medical diagnosis, does not act as a software medical device, and makes no false or misleading claims."
                            )
                            ClinicSectionCard(
                                title = "4. Right to Erasure & User Account Deletion",
                                body = "Both healthcare providers and patients have access to an in-app Account Deletion mechanism as required by Google Play Policies, featuring a 30-day freeze period."
                            )
                            ClinicSectionCard(
                                title = "5. Official Live Clinic Privacy Policy (GitHub Pages)",
                                body = "Full statutory disclosure is hosted live at https://dactorofficial.github.io/privacy-clinic.html pursuant to Nepal Individual Privacy Act 2075 and Google Play Health Apps Policies.",
                                actionLabel = "Open Live Policy in Browser",
                                onActionClick = {
                                    try {
                                        val intent = Intent(
                                            Intent.ACTION_VIEW,
                                            Uri.parse("https://dactorofficial.github.io/privacy-clinic.html")
                                        )
                                        context.startActivity(intent)
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "Opening Clinic Privacy Policy...", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // MANDATORY CHECKBOX
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = if (isAgreed) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                    border = BorderStroke(1.dp, if (isAgreed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { isAgreed = !isAgreed }
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = isAgreed,
                            onCheckedChange = { isAgreed = it },
                            colors = CheckboxDefaults.colors(
                                checkedColor = MaterialTheme.colorScheme.primary
                            )
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "I have read, understood, and accept Dactor's Clinic Terms of Service, Patient Confidentiality Policy, and Healthcare Regulations.",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            lineHeight = 16.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (isAgreed) {
                        onAccept?.invoke()
                        onDismiss()
                    }
                },
                enabled = isAgreed,
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "Accept & Proceed",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
            }
        },
        dismissButton = {
            if (!isMandatory) {
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Close", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    )
}

@Composable
private fun ClinicSectionCard(
    title: String,
    body: String,
    actionLabel: String? = null,
    onActionClick: (() -> Unit)? = null
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
            Text(body, fontSize = 11.sp, lineHeight = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (actionLabel != null && onActionClick != null) {
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable { onActionClick() }
                        .padding(vertical = 4.dp, horizontal = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.Default.OpenInBrowser,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = actionLabel,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}
