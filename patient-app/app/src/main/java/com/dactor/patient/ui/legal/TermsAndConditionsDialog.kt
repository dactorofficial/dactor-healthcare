package com.dactor.patient.ui.legal

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Shield
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
fun TermsAndConditionsDialog(
    isMandatory: Boolean = false,
    onAccept: (() -> Unit)? = null,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
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
                        Icons.Default.HealthAndSafety,
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
                    "Terms of Service & Privacy Policy",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    "Transparent Data Usage & Nepal Healthcare Compliance",
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
                // Scrollable legal & data usage sections
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        "Last Updated: October 2026 • Dactor Nepal Digital Healthcare Platform",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium
                    )

                    // Section 1: Data Usage Transparency
                    SectionCard(
                        title = "1. What We Do With Your Data (Data Handling Policy)",
                        body = "At Dactor, your medical privacy is sacred. Here is full disclosure of how we handle your information:\n\n" +
                                "• Information We Collect: Your name, mobile number, age, gender, email, optional Google Sign-In profile (name, email, avatar), booked clinic/doctor, appointment time slots, diagnostic lab tests, uploaded lab reports (PDF/images), device push notification token (FCM), and foreground GPS coordinates.\n" +
                                "• How We Use It: Strictly to generate live OPD tokens, compute real-time queue wait estimates, send high-priority alerts when your turn is near or doctor is free, verify your identity for lab report downloads, and generate billing invoices.\n" +
                                "• Storage & Encryption: All data in transit and at rest is secured via industry-standard TLS 1.3 encryption and Supabase/Firebase cloud isolation.\n" +
                                "• ZERO Data Selling: We DO NOT sell, rent, monetize, or share your personal health or contact information with third-party advertisers or data brokers under any circumstances."
                    )

                    // Section 2: Medical Disclaimer & Emergency Notice
                    SectionCard(
                        title = "2. Medical Disclaimer & Emergency Protocol (Dial 102)",
                        body = "IMPORTANT: Dactor is an outpatient (OPD) queue tracking, slot scheduling, and clinic discovery platform in Nepal. Dactor is NOT an emergency response service and does not provide automated diagnostic triage. In acute emergencies, severe chest pain, major trauma, or life-threatening crises, immediately call Nepal Ambulance (102) or go to the nearest hospital Emergency Room (ER)."
                    )

                    // Section 3: Live Queue, Arrival Windows & Opt-in Early Calls
                    SectionCard(
                        title = "3. Live Queue Tracking & Early Arrival Notifications",
                        body = "• Slot Windows: Dactor displays estimated arrival windows (e.g., 'around 3:20 PM' or '3:15 – 3:30 PM') because clinical consultation times vary per patient.\n" +
                                "• Non-Opted Patients: Patients who do not opt in retain their fixed scheduled slot. We will never show an estimated time earlier than your slot start time.\n" +
                                "• Opt-In Early Call: If you explicitly toggle 'Allow Early Call' during booking, the clinic may notify your device when the doctor is free ahead of schedule so you can choose to come in early."
                    )

                    // Section 4: Diagnostic Lab Reports Privacy Gate
                    SectionCard(
                        title = "4. 3-Stage Diagnostic Lab Pipeline & Identity Gate",
                        body = "Diagnostic tests progress through 3 verified stages: (1) Sample Collected, (2) Processing in Lab, and (3) Prepared & Uploaded. To protect sensitive pathology results from unauthorized access, report downloads require verified patient identity matching your booked full name."
                    )

                    // Section 5: Nepal Healthcare & Privacy Laws
                    SectionCard(
                        title = "5. Nepal Privacy Act 2075 & Electronic Transactions Act 2063",
                        body = "In compliance with Nepal's Individual Privacy Act 2075 (2018), Privacy Rules 2077, and Electronic Transactions Act 2063, your health information is confidential. Digital OPD tokens, queue confirmations, and electronic receipts generated on Dactor carry electronic validity under Nepal law."
                    )

                    // Section 6: Google Play Store Health Apps Policy & Right to Erasure
                    SectionCard(
                        title = "6. Google Play Health Apps Compliance & Account Deletion",
                        body = "Dactor complies with Google Play Health Apps and User Data Policies. Location permissions are used strictly in the foreground to locate nearby clinics on OpenStreetMap and are never tracked in the background. You have the right to delete your account at any time via Profile Settings with a 30-day grace period."
                    )

                    // Section 7: Nepal Medical Council (NMC) & Consultations
                    SectionCard(
                        title = "7. Nepal Medical Council (NMC) & Doctor-Patient Relationship",
                        body = "All medical examinations, prescriptions, and advice are provided independently by practitioners registered with the Nepal Medical Council (NMC) under the NMC Act 2020. Dactor acts solely as a scheduling and queue management technology intermediary."
                    )

                    // Section 8: Live Patient Privacy Policy URL
                    SectionCard(
                        title = "8. Official Live Patient Privacy Policy (GitHub Pages)",
                        body = "Full statutory disclosure is hosted live at https://dactorofficial.github.io/privacy-patient.html pursuant to Nepal Individual Privacy Act 2075 and Google Play Health Apps Policies.",
                        actionLabel = "Open Live Policy in Browser",
                        onActionClick = {
                            try {
                                val intent = Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("https://dactorofficial.github.io/privacy-patient.html")
                                )
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                Toast.makeText(context, "Opening Patient Privacy Policy...", Toast.LENGTH_SHORT).show()
                            }
                        }
                    )
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
                            text = "I have read, understood, and accept Dactor's Privacy Policy, Data Usage Terms, and Terms of Service.",
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
private fun SectionCard(
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
