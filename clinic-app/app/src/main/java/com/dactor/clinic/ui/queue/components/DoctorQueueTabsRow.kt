package com.dactor.clinic.ui.queue.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FreeBreakfast
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.clinic.ui.i18n.ClinicLanguage
import com.dactor.clinic.ui.i18n.LocalClinicLanguage

@Composable
fun DoctorQueueTabsRow(
    selectedTab: Int, // 0: Live, 1: Completed
    liveCount: Int,
    completedCount: Int,
    isOnBreak: Boolean,
    onTabSelected: (Int) -> Unit,
    onToggleBreak: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val currentLang = LocalClinicLanguage.current
    val isNepali = currentLang == ClinicLanguage.NEPALI
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.background
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Segmented Sub-tabs: Live vs Completed
            Row(
                modifier = Modifier
                    .background(Color(0xFFF1F5F9), RoundedCornerShape(12.dp))
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Live Tab Pill
                Surface(
                    shape = RoundedCornerShape(9.dp),
                    color = if (selectedTab == 0) Color(0xFF0284C7) else Color.Transparent,
                    modifier = Modifier.clickable { onTabSelected(0) }
                ) {
                    Text(
                        text = if (isNepali) "प्रत्यक्ष ($liveCount)" else "Live ($liveCount)",
                        fontSize = 12.sp,
                        fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Medium,
                        color = if (selectedTab == 0) Color.White else Color(0xFF64748B),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }

                // Completed Tab Pill
                Surface(
                    shape = RoundedCornerShape(9.dp),
                    color = if (selectedTab == 1) Color(0xFF0284C7) else Color.Transparent,
                    modifier = Modifier.clickable { onTabSelected(1) }
                ) {
                    Text(
                        text = if (isNepali) "सम्पन्न ($completedCount)" else "Completed ($completedCount)",
                        fontSize = 12.sp,
                        fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Medium,
                        color = if (selectedTab == 1) Color.White else Color(0xFF64748B),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
            }

            // Break Toggle: Placed directly beside Completed tab with NO info box banner
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (isOnBreak) Color(0xFFFEF3C7) else Color(0xFFF1F5F9),
                border = BorderStroke(1.dp, if (isOnBreak) Color(0xFFF59E0B) else Color(0xFFCBD5E1)),
                modifier = Modifier.clickable { onToggleBreak(!isOnBreak) }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.FreeBreakfast,
                        contentDescription = "Break Toggle",
                        tint = if (isOnBreak) Color(0xFFB45309) else Color(0xFF475569),
                        modifier = Modifier.size(15.dp)
                    )
                    Text(
                        text = if (isOnBreak) (if (isNepali) "ब्रेक: चालु" else "Break: ON") else (if (isNepali) "ब्रेक: बन्द" else "Break: OFF"),
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isOnBreak) Color(0xFFB45309) else Color(0xFF475569)
                    )
                }
            }
        }
    }
}
