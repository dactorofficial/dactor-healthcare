package com.dactor.patient.ui.booking

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Authentic Nepal Payment Gateway Branded Badge
 * Provides high-visibility, distinct brand styling for eSewa, Khalti, Fonepay, ConnectIPS, and Pay at Desk.
 */
@Composable
fun PaymentGatewayBadge(
    gatewayId: String,
    modifier: Modifier = Modifier
) {
    val cleanId = gatewayId.lowercase().trim()
    when (cleanId) {
        "esewa" -> {
            // eSewa Lime Green Brand Palette (#60BB46) with signature italic white 'e'
            Box(
                modifier = modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF60BB46)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "e",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontStyle = FontStyle.Italic,
                    fontSize = 25.sp,
                    lineHeight = 25.sp
                )
            }
        }
        "khalti" -> {
            // Khalti Deep Purple Brand Palette (#5D2E8E) with bold white 'K'
            Box(
                modifier = modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF5D2E8E)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "K",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 22.sp,
                    lineHeight = 22.sp
                )
            }
        }
        "fonepay" -> {
            // Fonepay Crimson Red Brand Palette (#C8102E) with QR scan glyph
            Box(
                modifier = modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFC8102E)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.QrCodeScanner,
                    contentDescription = "Fonepay QR",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
        "connectips" -> {
            // ConnectIPS Navy Blue Brand Palette (#0B3B60) with Bank Pillars and Red Accent
            Box(
                modifier = modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF0B3B60)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.AccountBalance,
                    contentDescription = "ConnectIPS Bank",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(4.dp)
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE31B23))
                )
            }
        }
        "pay_at_desk" -> {
            // Pay at Desk Warm Amber Brand Palette (#F59E0B) with Reception Counter Icon
            Box(
                modifier = modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFF59E0B)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Storefront,
                    contentDescription = "Pay at Desk",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
        else -> {
            // Generic digital payment fallback
            Box(
                modifier = modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Payment,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

/**
 * Modern Full-Width Non-Overlapping Payment Option Card
 * Stacks vertically with generous padding, brand badge, fee pill, and selection radio indicator.
 */
@Composable
fun PaymentOptionCard(
    gatewayId: String,
    title: String,
    subtitle: String,
    feeBadgeText: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val cleanId = gatewayId.lowercase().trim()

    val brandAccentColor = when (cleanId) {
        "esewa" -> Color(0xFF60BB46)
        "khalti" -> Color(0xFF5D2E8E)
        "fonepay" -> Color(0xFFC8102E)
        "connectips" -> Color(0xFF0B3B60)
        "pay_at_desk" -> Color(0xFFF59E0B)
        else -> MaterialTheme.colorScheme.primary
    }

    val borderColor = if (isSelected) brandAccentColor else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
    val containerColor = if (isSelected) {
        brandAccentColor.copy(alpha = 0.08f)
    } else {
        MaterialTheme.colorScheme.surface
    }

    Card(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = BorderStroke(if (isSelected) 2.dp else 1.dp, borderColor),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Authentic Gateway Badge
            PaymentGatewayBadge(gatewayId = gatewayId)

            // Titles and Fee Badges (Takes flexible remaining width with zero chance of overlap)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = title,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = if (cleanId == "pay_at_desk") Color(0xFFFEF3C7) else Color(0xFFD1FAE5)
                    ) {
                        Text(
                            text = feeBadgeText,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (cleanId == "pay_at_desk") Color(0xFFB45309) else Color(0xFF047857),
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.5.dp)
                        )
                    }
                }
                Text(
                    text = subtitle,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Radio Button Indicator
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .border(
                        width = if (isSelected) 2.dp else 1.5.dp,
                        color = if (isSelected) brandAccentColor else MaterialTheme.colorScheme.outline,
                        shape = CircleShape
                    )
                    .background(if (isSelected) brandAccentColor else Color.Transparent),
                contentAlignment = Alignment.Center
            ) {
                if (isSelected) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(Color.White)
                    )
                }
            }
        }
    }
}
