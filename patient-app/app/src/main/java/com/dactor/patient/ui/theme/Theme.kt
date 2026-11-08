package com.dactor.patient.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DactorLightColorScheme = lightColorScheme(
    primary = PrimaryTeal,
    onPrimary = OnPrimaryTeal,
    primaryContainer = PrimaryContainerTeal,
    onPrimaryContainer = OnPrimaryContainerTeal,
    secondary = SecondaryNavy,
    onSecondary = OnSecondaryNavy,
    secondaryContainer = SecondaryContainerNavy,
    onSecondaryContainer = OnSecondaryContainerNavy,
    tertiary = TertiaryCyan,
    onTertiary = OnTertiaryCyan,
    tertiaryContainer = TertiaryContainerCyan,
    onTertiaryContainer = OnTertiaryContainerCyan,
    background = BackgroundLight,
    onBackground = OnBackgroundLight,
    surface = SurfaceLight,
    onSurface = OnSurfaceLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = OnSurfaceVariantLight,
    outline = OutlineLight,
    outlineVariant = OutlineVariantLight
)

@Composable
fun DactorPatientTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DactorLightColorScheme,
        content = content
    )
}
