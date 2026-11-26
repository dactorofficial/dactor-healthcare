package com.dactor.clinic.ui.queue.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.clinic.ui.queue.QueueItemUi

@Composable
fun DoctorQueueItemCard(
    item: QueueItemUi,
    index: Int,
    isExpanded: Boolean,
    onCardClick: () -> Unit,
    currentEpochSecond: Long,
    slotCapacityRatio: String? = null,
    isSlotOverloaded: Boolean = false,
    onCallInside: (QueueItemUi) -> Unit,
    onCompleteConsultation: (QueueItemUi) -> Unit,
    onNoShowClick: (QueueItemUi) -> Unit,
    onClinicalRxClick: ((String) -> Unit)? = null,
    onMovePosition: ((QueueItemUi, Int) -> Unit)? = null,
    onSendAlertClick: ((QueueItemUi) -> Unit)? = null,
    cooldownUntilEpoch: Long? = null,
    isSendingAlert: Boolean = false,
    alertSentBadge: String? = null,
    onWalkInAlertClick: ((QueueItemUi) -> Unit)? = null,
    onCallInAlertClick: ((QueueItemUi) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val cooldownUntil = cooldownUntilEpoch ?: 0L
    val nowEpoch = currentEpochSecond * 1000L
    val cooldownRemainingSec = ((cooldownUntil - nowEpoch) / 1000L).coerceAtLeast(0L).toInt()
    val isCoolingDown = cooldownRemainingSec > 0
    val isSending = isSendingAlert
    val isAccountlessWalkin = item.isWalkin && item.userId.isNullOrBlank()

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(
            1.dp,
            if (item.status == "inside") Color(0xFF86EFAC) else Color(0xFFE2E8F0)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.5.dp),
        modifier = modifier
            .fillMaxWidth()
            .clickable { onCardClick() }
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Top Row: Avatar + Info + Position/Status Pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    // Avatar Circle
                    Surface(
                        shape = CircleShape,
                        color = if (item.status == "inside") Color(0xFF16A34A) else Color(0xFF0284C7),
                        modifier = Modifier.size(42.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = item.patientName,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            if (item.isWalkin) {
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = Color(0xFFF3E8FF)
                                ) {
                                    Text(
                                        text = "Walk-in",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF7E22CE),
                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                    )
                                }
                            }
                        }

                        // Demographics + Token
                        val demographics = buildList {
                            if (item.patientAge > 0) add("${item.patientAge} yrs")
                            if (item.patientGender.isNotBlank() && item.patientGender != "Registered") add(item.patientGender)
                            if (item.trackingCode.isNotBlank()) add("#${item.trackingCode}")
                        }
                        if (demographics.isNotEmpty()) {
                            Text(
                                text = demographics.joinToString(" • "),
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF0284C7)
                            )
                        }

                        // Appointment / Slot Time
                        if (item.appointmentTime.isNotBlank()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Icon(
                                    Icons.Default.AccessTime,
                                    contentDescription = null,
                                    tint = Color(0xFF64748B),
                                    modifier = Modifier.size(12.dp)
                                )
                                Text(
                                    text = item.appointmentTime,
                                    fontSize = 11.sp,
                                    color = Color(0xFF64748B)
                                )
                            }
                        }

                        // Online Paid Badge
                        if (item.paymentMode.equals("ONLINE", ignoreCase = true) && item.paymentStatus.equals("paid", ignoreCase = true)) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color(0xFFDCFCE7),
                                border = BorderStroke(0.5.dp, Color(0xFF86EFAC)),
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                Text(
                                    text = "✓ Paid Online",
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF166534),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        // Pay at Desk Badge
                        if (item.paymentMode == "PAY_AT_DESK") {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = if (item.paymentStatus == "paid") Color(0xFFDCFCE7) else Color(0xFFFEF3C7),
                                border = BorderStroke(0.5.dp, if (item.paymentStatus == "paid") Color(0xFF86EFAC) else Color(0xFFFDE68A)),
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                val dueLabel = if (item.totalAmount % 1.0 == 0.0) item.totalAmount.toInt().toString() else String.format(java.util.Locale.US, "%.2f", item.totalAmount)
                                Text(
                                    text = if (item.paymentStatus == "paid") "✓ Paid at Desk" else "💵 Pay at Desk (Due Rs. $dueLabel)",
                                    fontSize = 10.5.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (item.paymentStatus == "paid") Color(0xFF166534) else Color(0xFF92400E),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        // Overloaded Slot Capacity Badge (e.g. 13/12 Capacity)
                        if (isSlotOverloaded && !slotCapacityRatio.isNullOrBlank()) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color(0xFFFEF3C7),
                                border = BorderStroke(0.5.dp, Color(0xFFF59E0B)),
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Warning,
                                        contentDescription = null,
                                        tint = Color(0xFFB45309),
                                        modifier = Modifier.size(11.dp)
                                    )
                                    Text(
                                        text = "$slotCapacityRatio Capacity",
                                        fontSize = 10.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFFB45309)
                                    )
                                }
                            }
                        }

                        // Elapsed Timer for active consultation
                        if (item.status == "inside") {
                            val elapsedSec = remember(item.insideAt, currentEpochSecond) {
                                try {
                                    val startEpoch = java.time.OffsetDateTime.parse(item.insideAt.orEmpty().trim()).toEpochSecond()
                                    (currentEpochSecond - startEpoch).coerceAtLeast(0L)
                                } catch (_: Exception) {
                                    0L
                                }
                            }
                            val mm = elapsedSec / 60
                            val ss = elapsedSec % 60
                            val formattedTime = String.format(java.util.Locale.US, "%02d:%02d", mm, ss)

                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color(0xFFDCFCE7),
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Icon(
                                        Icons.Default.Timer,
                                        contentDescription = null,
                                        tint = Color(0xFF15803D),
                                        modifier = Modifier.size(11.dp)
                                    )
                                    Text(
                                        text = "In Consultation • $formattedTime",
                                        fontSize = 10.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF15803D)
                                    )
                                }
                            }
                        }

                        // Notification Sent Status Badge / Cooldown Countdown
                        if (isCoolingDown || !alertSentBadge.isNullOrBlank()) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = Color(0xFFE0F2FE),
                                border = BorderStroke(0.5.dp, Color(0xFF38BDF8)),
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Icon(
                                        Icons.Default.NotificationsActive,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(11.dp)
                                    )
                                    Text(
                                        text = if (isCoolingDown) "Alert Sent (${cooldownRemainingSec}s)" else (alertSentBadge ?: "Alert Sent"),
                                        fontSize = 10.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0369A1)
                                    )
                                }
                            }
                        }
                    }
                }

                // Right: Status / Position Pill + Chevron
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = when (item.status) {
                            "inside" -> Color(0xFFDCFCE7)
                            "waiting" -> Color(0xFFE0F2FE)
                            "done" -> Color(0xFFE5F8EE)
                            "processing" -> Color(0xFFEDE9FE)
                            "no_show" -> Color(0xFFFEE2E2)
                            else -> Color(0xFFF1F5F9)
                        }
                    ) {
                        Text(
                            text = when (item.status) {
                                "inside" -> "Inside"
                                "waiting" -> "#${item.queuePosition}"
                                "done" -> "Done"
                                "processing" -> "Processing"
                                "no_show" -> "No-Show"
                                else -> item.status.replaceFirstChar { it.uppercase() }
                            },
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 13.sp,
                            color = when (item.status) {
                                "inside" -> Color(0xFF15803D)
                                "waiting" -> Color(0xFF0369A1)
                                "done" -> Color(0xFF0F8A50)
                                "processing" -> Color(0xFF6D28D9)
                                "no_show" -> Color(0xFFDC2626)
                                else -> Color(0xFF475569)
                            },
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        )
                    }

                    Icon(
                        imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = "Expand",
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // Primary Action Buttons Row
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (item.status == "waiting") {
                    Button(
                        onClick = { onCallInside(item) },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Call Inside",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                } else if (item.status == "inside") {
                    Button(
                        onClick = { onCompleteConsultation(item) },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Mark Done",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }

                // Skip / No-show button for live items
                if (item.status in listOf("waiting", "inside")) {
                    OutlinedButton(
                        onClick = { onNoShowClick(item) },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626)),
                        border = BorderStroke(1.dp, Color(0xFFFCA5A5)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = "Skip / No-Show",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            // Dedicated Patient Notification Actions: Walk In (Arrive Soon) & Call In (Call Inside)
            if (item.status == "waiting" && (onWalkInAlertClick != null || onCallInAlertClick != null)) {
                Spacer(modifier = Modifier.height(6.dp))
                if (isAccountlessWalkin) {
                    OutlinedButton(
                        onClick = {},
                        enabled = false,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            disabledContainerColor = Color(0xFFF1F5F9),
                            disabledContentColor = Color(0xFF94A3B8)
                        ),
                        border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            Icons.Default.PersonOff,
                            contentDescription = null,
                            tint = Color(0xFF94A3B8),
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Walk-in (No App Account)",
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF94A3B8)
                        )
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // "Walk In" (Arrive Soon Alert)
                        if (onWalkInAlertClick != null) {
                            OutlinedButton(
                                onClick = { onWalkInAlertClick(item) },
                                enabled = !isSending && !isCoolingDown,
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Color(0xFF0369A1),
                                    disabledContentColor = if (isCoolingDown) Color(0xFF0284C7) else Color(0xFF94A3B8)
                                ),
                                border = BorderStroke(
                                    1.dp,
                                    if (isCoolingDown) Color(0xFFBAE6FD) else Color(0xFF7DD3FC)
                                ),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                if (isSending) {
                                    CircularProgressIndicator(
                                        color = Color(0xFF0284C7),
                                        modifier = Modifier.size(13.dp),
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Sending...", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                } else if (isCoolingDown) {
                                    Icon(
                                        Icons.Default.Schedule,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text("Walk In (${cooldownRemainingSec}s)", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                } else {
                                    Icon(
                                        Icons.Default.DirectionsRun,
                                        contentDescription = null,
                                        tint = Color(0xFF0284C7),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Walk In", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        // "Call In" (Call Inside Alert)
                        if (onCallInAlertClick != null) {
                            OutlinedButton(
                                onClick = { onCallInAlertClick(item) },
                                enabled = !isSending && !isCoolingDown,
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Color(0xFF0D9488),
                                    disabledContentColor = if (isCoolingDown) Color(0xFF0D9488) else Color(0xFF94A3B8)
                                ),
                                border = BorderStroke(
                                    1.dp,
                                    if (isCoolingDown) Color(0xFF99F6E4) else Color(0xFF5EEAD4)
                                ),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                if (isSending) {
                                    CircularProgressIndicator(
                                        color = Color(0xFF0D9488),
                                        modifier = Modifier.size(13.dp),
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Sending...", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                } else if (isCoolingDown) {
                                    Icon(
                                        Icons.Default.Schedule,
                                        contentDescription = null,
                                        tint = Color(0xFF0D9488),
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text("Call In (${cooldownRemainingSec}s)", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                } else {
                                    Icon(
                                        Icons.Default.Campaign,
                                        contentDescription = null,
                                        tint = Color(0xFF0D9488),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Call In", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }

            // Expanded Drawer
            AnimatedVisibility(visible = isExpanded) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp)
                ) {
                    Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)
                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Reorder controls if waiting
                        if (item.status == "waiting" && onMovePosition != null) {
                            OutlinedButton(
                                onClick = { onMovePosition(item, -1) },
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.ArrowUpward, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text("Move Up", fontSize = 11.sp)
                            }
                            OutlinedButton(
                                onClick = { onMovePosition(item, 1) },
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.ArrowDownward, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text("Move Down", fontSize = 11.sp)
                            }
                        }

                        // Arrive soon notification
                        if (item.status == "waiting" && onSendAlertClick != null) {
                            val isAccountlessWalkin = item.isWalkin && item.userId.isNullOrBlank()
                            OutlinedButton(
                                onClick = { onSendAlertClick(item) },
                                enabled = !isAccountlessWalkin,
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(Icons.Default.Notifications, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(3.dp))
                                Text(
                                    text = if (isAccountlessWalkin) "No App Acct" else "Alert Patient",
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
