package com.dactor.clinic.ui.queue.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.clinic.ui.i18n.ClinicLanguage
import com.dactor.clinic.ui.i18n.LocalClinicLanguage

@Composable
fun QueueStatCards(
    insideCount: Int,
    waitingCount: Int,
    completedCount: Int,
    modifier: Modifier = Modifier
) {
    val currentLang = LocalClinicLanguage.current
    val isNepali = currentLang == ClinicLanguage.NEPALI
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // 1. In Consultation Card (Soft Light Blue)
            Surface(
                color = Color(0xFFE8F1FD),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f)
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFD3E4FB),
                        modifier = Modifier.size(22.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                tint = Color(0xFF1E64D4),
                                modifier = Modifier.size(13.dp)
                            )
                        }
                    }
                    Text(
                        text = "$insideCount",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF1351B4)
                    )
                    Text(
                        text = if (isNepali) "परामर्श कक्षमा" else "In Consultation",
                        fontSize = 10.sp,
                        lineHeight = 12.sp,
                        color = Color(0xFF3362A8),
                        fontWeight = FontWeight.Medium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // 2. Waiting in Lobby Card (Soft Light Peach/Orange)
            Surface(
                color = Color(0xFFFDF2E4),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f)
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFFAE0C3),
                        modifier = Modifier.size(22.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.AccessTime,
                                contentDescription = null,
                                tint = Color(0xFFB45B10),
                                modifier = Modifier.size(13.dp)
                            )
                        }
                    }
                    Text(
                        text = "$waitingCount",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFFB45B10)
                    )
                    Text(
                        text = if (isNepali) "प्रतीक्षारत" else "Waiting in Lobby",
                        fontSize = 10.sp,
                        lineHeight = 12.sp,
                        color = Color(0xFF9E5417),
                        fontWeight = FontWeight.Medium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // 3. Completed Today Card (Soft Light Mint/Green)
            Surface(
                color = Color(0xFFE5F8EE),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f)
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFFC7F0DB),
                        modifier = Modifier.size(22.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF0F8A50),
                                modifier = Modifier.size(13.dp)
                            )
                        }
                    }
                    Text(
                        text = "$completedCount",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF0F8A50)
                    )
                    Text(
                        text = if (isNepali) "आज सम्पन्न" else "Completed Today",
                        fontSize = 10.sp,
                        lineHeight = 12.sp,
                        color = Color(0xFF137747),
                        fontWeight = FontWeight.Medium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
