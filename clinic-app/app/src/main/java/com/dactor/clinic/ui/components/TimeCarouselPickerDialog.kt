package com.dactor.clinic.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import java.util.Locale

/**
 * Modern Compose-native Carousel Time Picker Dialog.
 * Replaces radial clock-hand interfaces with horizontal scrollable carousels for:
 * - Hours (1 to 12)
 * - Minutes (00 to 55 with 5-min intervals + 1-min fine-tuning)
 * - AM / PM toggle
 *
 * Supports strict past-time prevention via [minTimeMinutes].
 */
@Composable
fun TimeCarouselPickerDialog(
    initialTime: String = "09:00",
    minTimeMinutes: Int? = null,
    title: String = "Select Time",
    onDismiss: () -> Unit,
    onTimeSelected: (String) -> Unit
) {
    val parsed = remember(initialTime) {
        try {
            val parts = initialTime.trim().split(":")
            val h = parts.getOrNull(0)?.toIntOrNull() ?: 9
            val m = parts.getOrNull(1)?.take(2)?.toIntOrNull() ?: 0
            Pair(h.coerceIn(0, 23), m.coerceIn(0, 59))
        } catch (e: Exception) {
            Pair(9, 0)
        }
    }

    // Auto-advance to minTimeMinutes if initial time is in the past
    val effectiveInitial = remember(parsed, minTimeMinutes) {
        val totalM = parsed.first * 60 + parsed.second
        if (minTimeMinutes != null && totalM < minTimeMinutes) {
            val h = (minTimeMinutes / 60) % 24
            val m = minTimeMinutes % 60
            Pair(h, m)
        } else {
            parsed
        }
    }

    val initialH24 = effectiveInitial.first
    val initialM = effectiveInitial.second
    val initialPeriod = if (initialH24 >= 12) "PM" else "AM"
    val initialH12 = when {
        initialH24 == 0 -> 12
        initialH24 > 12 -> initialH24 - 12
        else -> initialH24
    }

    var selectedHour12 by remember { mutableIntStateOf(initialH12) }
    var selectedMinute by remember { mutableIntStateOf(initialM) }
    var selectedPeriod by remember { mutableStateOf(initialPeriod) }

    val hourListState = rememberLazyListState()
    val minuteListState = rememberLazyListState()

    val hours = remember { (1..12).toList() }
    val minutePresets = remember { listOf(0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55) }

    // Scroll carousel to initial positions
    LaunchedEffect(Unit) {
        val hIndex = (selectedHour12 - 1).coerceIn(0, 11)
        hourListState.animateScrollToItem(hIndex)

        val mIndex = minutePresets.indexOfFirst { it >= selectedMinute }.let {
            if (it == -1) minutePresets.size - 1 else it
        }
        minuteListState.animateScrollToItem(mIndex)
    }

    val currentHour24 = remember(selectedHour12, selectedPeriod) {
        when {
            selectedPeriod == "AM" && selectedHour12 == 12 -> 0
            selectedPeriod == "AM" -> selectedHour12
            selectedPeriod == "PM" && selectedHour12 == 12 -> 12
            else -> selectedHour12 + 12
        }
    }

    val totalSelectedMinutes = remember(currentHour24, selectedMinute) {
        currentHour24 * 60 + selectedMinute
    }

    val formatted24h = remember(currentHour24, selectedMinute) {
        String.format(Locale.US, "%02d:%02d", currentHour24, selectedMinute)
    }

    val formatted12h = remember(selectedHour12, selectedMinute, selectedPeriod) {
        String.format(Locale.US, "%02d:%02d %s", selectedHour12, selectedMinute, selectedPeriod)
    }

    val isPastTime = minTimeMinutes != null && totalSelectedMinutes < minTimeMinutes
    val isValid = !isPastTime

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Dialog Title
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = title,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Text(
                            text = "Carousel Clock",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                // Digital Preview Banner
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = if (isValid) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f)
                    else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.35f),
                    border = BorderStroke(
                        1.dp,
                        if (isValid) MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                        else MaterialTheme.colorScheme.error
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "CHOSEN TIME",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isValid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                            letterSpacing = 1.sp
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = formatted12h,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = if (isValid) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onErrorContainer
                        )
                        Text(
                            text = "24-Hour Format: $formatted24h",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                // Section 1: Hour Carousel (1 to 12)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Hour Carousel (1 - 12)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    LazyRow(
                        state = hourListState,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(hours) { h ->
                            val isSelected = h == selectedHour12
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = if (isSelected) BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary) else null,
                                shadowElevation = if (isSelected) 3.dp else 0.dp,
                                modifier = Modifier
                                    .size(52.dp)
                                    .clickable { selectedHour12 = h }
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = String.format(Locale.US, "%02d", h),
                                        fontSize = 16.sp,
                                        fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Medium,
                                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }

                // Section 2: Minute Carousel (00 to 55 + fine tune)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Minute Carousel",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            IconButton(
                                onClick = { selectedMinute = (selectedMinute - 1 + 60) % 60 },
                                modifier = Modifier.size(26.dp)
                            ) {
                                Icon(Icons.Default.Remove, contentDescription = "-1 min", modifier = Modifier.size(16.dp))
                            }
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant
                            ) {
                                Text(
                                    text = String.format(Locale.US, "%02d m", selectedMinute),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                            IconButton(
                                onClick = { selectedMinute = (selectedMinute + 1) % 60 },
                                modifier = Modifier.size(26.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = "+1 min", modifier = Modifier.size(16.dp))
                            }
                        }
                    }

                    LazyRow(
                        state = minuteListState,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(minutePresets) { m ->
                            val isSelected = m == selectedMinute
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = if (isSelected) BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary) else null,
                                shadowElevation = if (isSelected) 3.dp else 0.dp,
                                modifier = Modifier
                                    .size(52.dp)
                                    .clickable { selectedMinute = m }
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = String.format(Locale.US, "%02d", m),
                                        fontSize = 16.sp,
                                        fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Medium,
                                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }

                // Section 3: AM / PM Period Selection
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Period (AM / PM)",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        listOf("AM", "PM").forEach { period ->
                            val isSelected = selectedPeriod == period
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                border = if (isSelected) BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary) else null,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(44.dp)
                                    .clickable { selectedPeriod = period }
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = period,
                                        fontSize = 14.sp,
                                        fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.SemiBold,
                                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }

                // Validation Warning (Past Time Disallowed)
                if (isPastTime) {
                    val minVal = minTimeMinutes ?: 0
                    val minH = (minVal / 60) % 24
                    val minM = minVal % 60
                    val minPeriod = if (minH >= 12) "PM" else "AM"
                    val minH12 = when {
                        minH == 0 -> 12
                        minH > 12 -> minH - 12
                        else -> minH
                    }
                    val minFormatted = String.format(Locale.US, "%02d:%02d %s", minH12, minM, minPeriod)

                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = "Cannot select past time ($formatted12h). Must be at or after current time ($minFormatted).",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                lineHeight = 14.sp
                            )
                        }
                    }
                }

                // Action Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancel")
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        onClick = {
                            if (isValid) {
                                onTimeSelected(formatted24h)
                                onDismiss()
                            }
                        },
                        enabled = isValid,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Confirm Time")
                    }
                }
            }
        }
    }
}
