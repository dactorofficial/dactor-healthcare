package com.dactor.clinic.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.clinic.ui.i18n.ClinicLanguage
import com.dactor.clinic.ui.i18n.LocalClinicLanguage
import com.dactor.clinic.ui.i18n.LocalUpdateClinicLanguage

/**
 * Direct 1-tap quick language toggle for Clinic & Doctor top bars.
 * Switches instantly between English and Nepali without any nested modal.
 */
@Composable
fun ClinicQuickLanguageButton(
    modifier: Modifier = Modifier,
    size: Dp = 38.dp,
    compact: Boolean = false
) {
    val currentLang = LocalClinicLanguage.current
    val updateLanguage = LocalUpdateClinicLanguage.current

    val nextLang = if (currentLang == ClinicLanguage.ENGLISH) ClinicLanguage.NEPALI else ClinicLanguage.ENGLISH
    val isNepali = currentLang == ClinicLanguage.NEPALI

    val bgColor by animateColorAsState(
        targetValue = if (isNepali) Color(0xFFEFF6FF) else Color(0xFFF8FAFC),
        label = "quickClinicLangBg"
    )
    val borderColor by animateColorAsState(
        targetValue = if (isNepali) Color(0xFF60A5FA) else Color(0xFFE2E8F0),
        label = "quickClinicLangBorder"
    )

    if (compact) {
        Surface(
            shape = CircleShape,
            color = bgColor,
            border = BorderStroke(1.dp, borderColor),
            modifier = modifier
                .size(size)
                .clip(CircleShape)
                .clickable { updateLanguage(nextLang) }
        ) {
            Box(contentAlignment = Alignment.Center) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Language,
                        contentDescription = "Toggle Language",
                        tint = Color(0xFF0284C7),
                        modifier = Modifier.size(15.dp)
                    )
                    Spacer(Modifier.width(2.dp))
                    Text(
                        text = currentLang.shortBadge,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color(0xFF1E293B)
                    )
                }
            }
        }
    } else {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = bgColor,
            border = BorderStroke(1.dp, borderColor),
            modifier = modifier
                .height(size)
                .clip(RoundedCornerShape(12.dp))
                .clickable { updateLanguage(nextLang) }
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Language,
                    contentDescription = "Toggle Language",
                    tint = Color(0xFF0284C7),
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = if (isNepali) "नेपाली" else "EN",
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF1E293B)
                )
            }
        }
    }
}
