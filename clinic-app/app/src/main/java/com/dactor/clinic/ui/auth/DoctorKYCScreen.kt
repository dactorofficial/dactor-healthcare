package com.dactor.clinic.ui.auth

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.dactor.clinic.data.repository.DoctorRepository
import com.dactor.clinic.ui.navigation.NavRoutes
import kotlinx.coroutines.launch
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorKYCScreen(
    navController: NavController,
    doctorId: String? = null,
    doctorRepository: DoctorRepository? = null
) {
    val effectiveDoctorId = remember(doctorId) {
        doctorId?.ifBlank { null } ?: UUID.randomUUID().toString()
    }

    val context = LocalContext.current
    var nmcLicense by remember { mutableStateOf("") }

    var licenseUri by remember { mutableStateOf<Uri?>(null) }
    var licenseFileName by remember { mutableStateOf<String?>(null) }
    var licenseFileSize by remember { mutableStateOf<String?>(null) }
    var licenseBytes by remember { mutableStateOf<ByteArray?>(null) }

    var certificateUri by remember { mutableStateOf<Uri?>(null) }
    var certificateFileName by remember { mutableStateOf<String?>(null) }
    var certificateFileSize by remember { mutableStateOf<String?>(null) }
    var certificateBytes by remember { mutableStateOf<ByteArray?>(null) }

    var isSubmitted by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    // Real Native Android File Picker for NMC License Document (PDF / Images) with <= 500 KB auto-compression
    val licensePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            licenseUri = uri
            val resolvedName = com.dactor.clinic.domain.util.FileCompressor.resolveRealFileName(
                context = context,
                uri = uri,
                defaultBaseName = "nmc_license"
            )
            coroutineScope.launch {
                val compressed = com.dactor.clinic.domain.util.FileCompressor.compressUri(
                    context = context,
                    uri = uri,
                    fallbackFileName = resolvedName
                )
                if (compressed != null) {
                    licenseFileName = compressed.fileName
                    licenseFileSize = compressed.formattedSummary
                    licenseBytes = compressed.bytes
                }
            }
        }
    }

    // Real Native Android File Picker for Medical Degree Certificate with <= 500 KB auto-compression
    val certificatePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            certificateUri = uri
            val resolvedName = com.dactor.clinic.domain.util.FileCompressor.resolveRealFileName(
                context = context,
                uri = uri,
                defaultBaseName = "medical_degree"
            )
            coroutineScope.launch {
                val compressed = com.dactor.clinic.domain.util.FileCompressor.compressUri(
                    context = context,
                    uri = uri,
                    fallbackFileName = resolvedName
                )
                if (compressed != null) {
                    certificateFileName = compressed.fileName
                    certificateFileSize = compressed.formattedSummary
                    certificateBytes = compressed.bytes
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Doctor KYC Verification", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Step 2 of 2: Medical Credentials & NMC License",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary
            )

            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
                ),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Default.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
                    Column {
                        Text("Strict Verification Mandate", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text(
                            "In accordance with Nepal medical council regulations, all practicing doctors must submit their actual Nepal Medical Council (NMC) registration license and degree certificate for Super Admin verification.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            lineHeight = 16.sp
                        )
                    }
                }
            }

            OutlinedTextField(
                value = nmcLicense,
                onValueChange = { nmcLicense = it },
                label = { Text("Nepal Medical Council (NMC) License No.") },
                placeholder = { Text("e.g. NMC-14820-MED") },
                leadingIcon = { Icon(Icons.Default.Description, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            )

            // Document 1: Actual NMC License PDF / Image Picker
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("1. Upload NMC Registration License", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        if (licenseFileName != null) {
                            Surface(color = Color(0xFFD1FAE5), shape = RoundedCornerShape(6.dp)) {
                                Text(
                                    "Ready to upload",
                                    color = Color(0xFF065F46),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }

                    Text("Pick an official PDF document or scanned photo from your phone storage.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    if (licenseFileName != null) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(24.dp))
                                    Column {
                                        Text(licenseFileName ?: "", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                        if (!licenseFileSize.isNullOrBlank()) {
                                            Text(licenseFileSize ?: "", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                }

                                TextButton(onClick = { licensePickerLauncher.launch("*/*") }) {
                                    Text("Change", fontSize = 12.sp)
                                }
                            }
                        }
                    } else {
                        OutlinedButton(
                            onClick = { licensePickerLauncher.launch("*/*") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Select NMC License File (PDF / Image)")
                        }
                    }
                }
            }

            // Document 2: Actual Medical Degree Certificate PDF / Image Picker
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("2. Upload MBBS / MD Degree Certificate", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        if (certificateFileName != null) {
                            Surface(color = Color(0xFFD1FAE5), shape = RoundedCornerShape(6.dp)) {
                                Text(
                                    "Ready to upload",
                                    color = Color(0xFF065F46),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }

                    Text("Pick an official medical university degree certificate (PDF / Image).", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

                    if (certificateFileName != null) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(24.dp))
                                    Column {
                                        Text(certificateFileName ?: "", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                        if (!certificateFileSize.isNullOrBlank()) {
                                            Text(certificateFileSize ?: "", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                }

                                TextButton(onClick = { certificatePickerLauncher.launch("*/*") }) {
                                    Text("Change", fontSize = 12.sp)
                                }
                            }
                        }
                    } else {
                        OutlinedButton(
                            onClick = { certificatePickerLauncher.launch("*/*") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Select Degree Certificate File (PDF / Image)")
                        }
                    }
                }
            }

            if (statusMessage != null) {
                Text(
                    text = statusMessage ?: "",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Medium
                )
            }

            Button(
                onClick = {
                    isSubmitting = true
                    statusMessage = "Uploading documents and submitting NMC credentials..."

                    coroutineScope.launch {
                        var licenseUrl: String? = null
                        var certUrl: String? = null

                        if (licenseBytes != null && !licenseFileName.isNullOrBlank()) {
                            val cleanName = licenseFileName!!.replace("\\s+".toRegex(), "_")
                            val remoteName = "nmc_${effectiveDoctorId}_${System.currentTimeMillis()}_$cleanName"
                            licenseUrl = doctorRepository?.uploadKycFile(remoteName, licenseBytes!!) ?: licenseFileName
                        } else if (!licenseFileName.isNullOrBlank()) {
                            licenseUrl = licenseFileName
                        }

                        if (certificateBytes != null && !certificateFileName.isNullOrBlank()) {
                            val cleanName = certificateFileName!!.replace("\\s+".toRegex(), "_")
                            val remoteName = "degree_${effectiveDoctorId}_${System.currentTimeMillis()}_$cleanName"
                            certUrl = doctorRepository?.uploadKycFile(remoteName, certificateBytes!!) ?: certificateFileName
                        } else if (!certificateFileName.isNullOrBlank()) {
                            certUrl = certificateFileName
                        }

                        doctorRepository?.submitDoctorKyc(
                            doctorId = effectiveDoctorId,
                            nmcLicense = nmcLicense.trim(),
                            licenseDocUrl = licenseUrl,
                            certificatesDocUrl = certUrl
                        )

                        isSubmitting = false
                        isSubmitted = true
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 52.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                shape = RoundedCornerShape(14.dp),
                enabled = !isSubmitting && nmcLicense.isNotBlank() && licenseFileName != null
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(10.dp))
                    Text("Uploading & Verifying...", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                } else {
                    Text("Submit NMC Documents for Admin Review", fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
                }
            }
        }

        if (isSubmitted) {
            AlertDialog(
                onDismissRequest = { /* Require user click */ },
                icon = { Icon(Icons.Default.HourglassTop, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(44.dp)) },
                title = { Text("Waiting for Admin Confirmation", fontWeight = FontWeight.Bold, color = Color(0xFF92400E)) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Surface(
                            color = Color(0xFFFEF3C7),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "NMC Credentials Submitted • Pending Review",
                                color = Color(0xFF92400E),
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(8.dp)
                            )
                        }

                        Text(
                            text = "Your NMC registration documents and certificates have been submitted to the Super Admin for verification.",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )

                        Text(
                            text = "In compliance with Nepal Medical Council regulations, your Doctor OPD Consultation console is locked and waiting for confirmation by the Super Admin.",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Text(
                            text = "When you log in, your account will show 'Waiting for confirmation' until the Super Admin verifies your medical credentials.",
                            fontSize = 11.sp,
                            color = Color(0xFFB45309),
                            fontWeight = FontWeight.Medium
                        )
                    }
                },
                confirmButton = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                try {
                                    val intent = android.content.Intent(
                                        android.content.Intent.ACTION_VIEW,
                                        Uri.parse("https://dactorofficial.github.io/support")
                                    )
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    android.widget.Toast.makeText(context, "Opening support site...", android.widget.Toast.LENGTH_SHORT).show()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.SupportAgent, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Contact Dactor Practitioner Support Desk", fontWeight = FontWeight.Bold, color = Color.White)
                        }

                        OutlinedButton(
                            onClick = {
                                isSubmitted = false
                                navController.navigate(NavRoutes.ClinicLogin) {
                                    popUpTo(0) { inclusive = true }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Return to Login Portal", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            )
        }
    }
}

private fun getDocumentMetadata(context: Context, uri: Uri): Pair<String, String> {
    var displayName = "Document.pdf"
    var sizeStr = ""
    try {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (cursor.moveToFirst()) {
                if (nameIndex != -1) {
                    val n = cursor.getString(nameIndex)
                    if (!n.isNullOrBlank()) displayName = n
                }
                if (sizeIndex != -1) {
                    val sizeBytes = cursor.getLong(sizeIndex)
                    sizeStr = if (sizeBytes > 1024 * 1024) {
                        String.format("%.1f MB", sizeBytes.toDouble() / (1024 * 1024))
                    } else {
                        "${sizeBytes / 1024} KB"
                    }
                }
            }
        }
    } catch (_: Exception) {}
    return Pair(displayName, sizeStr)
}
