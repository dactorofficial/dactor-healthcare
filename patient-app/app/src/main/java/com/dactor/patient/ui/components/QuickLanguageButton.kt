package com.dactor.patient.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dactor.patient.ui.i18n.AppLanguage
import com.dactor.patient.ui.i18n.LocalAppLanguage
import com.dactor.patient.ui.i18n.LocalUpdateAppLanguage

/**
 * Direct 1-tap quick language toggle placed right beside the top notification bell.
 * Tapping it switches instantly between English and Nepali without any nested modal.
 */
@Composable
fun QuickLanguageButton(
    modifier: Modifier = Modifier,
    compact: Boolean = false
) {
    val currentLang = LocalAppLanguage.current
    val updateLanguage = LocalUpdateAppLanguage.current

    val nextLang = if (currentLang == AppLanguage.ENGLISH) AppLanguage.NEPALI else AppLanguage.ENGLISH
    val isNepali = currentLang == AppLanguage.NEPALI

    val bgColor by animateColorAsState(
        targetValue = if (isNepali) Color(0xFFEFF6FF) else Color.White,
        label = "quickLangBg"
    )
    val borderColor by animateColorAsState(
        targetValue = if (isNepali) Color(0xFF60A5FA) else Color(0xFFCBD5E1),
        label = "quickLangBorder"
    )

    if (compact) {
        Surface(
            shape = CircleShape,
            color = bgColor,
            border = BorderStroke(1.dp, borderColor),
            shadowElevation = 1.dp,
            modifier = modifier
                .size(36.dp)
                .clip(CircleShape)
                .clickable { updateLanguage(nextLang) }
        ) {
            Box(contentAlignment = Alignment.Center) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(horizontal = 2.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Language,
                        contentDescription = "Change Language",
                        tint = Color(0xFF0284C7),
                        modifier = Modifier.size(15.dp)
                    )
                    Spacer(Modifier.width(2.dp))
                    Text(
                        text = currentLang.shortBadge,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color(0xFF0F172A)
                    )
                }
            }
        }
    } else {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = bgColor,
            border = BorderStroke(1.dp, borderColor),
            shadowElevation = 2.dp,
            modifier = modifier
                .height(42.dp)
                .clip(RoundedCornerShape(12.dp))
                .clickable { updateLanguage(nextLang) }
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Language,
                    contentDescription = "Toggle Language",
                    tint = Color(0xFF0284C7),
                    modifier = Modifier.size(17.dp)
                )
                Text(
                    text = if (isNepali) "नेपाली" else "EN",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color(0xFF0F172A)
                )
            }
        }
    }
}
