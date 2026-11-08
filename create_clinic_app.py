import os

project_dir = r"c:\Users\notan\Downloads\dactorsecond\clinic-app"

files = {
    "settings.gradle.kts": """\
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "DactorClinic"
include(":app")
""",
    "build.gradle.kts": """\
// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    id("com.android.application") version "8.4.1" apply false
    id("org.jetbrains.kotlin.android") version "2.0.0" apply false
    id("com.google.dagger.hilt.android") version "2.51.1" apply false
    id("com.google.gms.google-services") version "4.4.1" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.0" apply false
    id("com.google.devtools.ksp") version "2.0.0-1.0.22" apply false
}
""",
    "gradle.properties": """\
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
""",
    "app/build.gradle.kts": """\
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
    id("kotlinx-serialization")
}

android {
    namespace = "com.dactor.clinic"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dactor.clinic"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.2")
    implementation("androidx.activity:activity-compose:1.9.0")
    
    val composeBom = platform("androidx.compose:compose-bom:2024.05.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    
    implementation("com.google.dagger:hilt-android:2.51.1")
    ksp("com.google.dagger:hilt-android-compiler:2.51.1")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    
    val supabaseVersion = "2.4.0"
    implementation("io.github.jan-tennert.supabase:postgrest-kt:$supabaseVersion")
    implementation("io.github.jan-tennert.supabase:auth-kt:$supabaseVersion")
    implementation("io.github.jan-tennert.supabase:storage-kt:$supabaseVersion")
    implementation("io.github.jan-tennert.supabase:realtime-kt:$supabaseVersion")
    implementation("io.ktor:ktor-client-okhttp:2.3.11")
    
    implementation(platform("com.google.firebase:firebase-bom:33.0.0"))
    implementation("com.google.firebase:firebase-messaging")
    
    implementation("io.coil-kt:coil-compose:2.6.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")
}
""",
    "gradle/wrapper/gradle-wrapper.properties": """\
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
""",
    "app/src/main/AndroidManifest.xml": """\
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".DactorClinicApp"
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.DactorClinic"
        tools:targetApi="35">
        
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.DactorClinic">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
""",
    "app/src/main/res/values/strings.xml": """\
<resources>
    <string name="app_name">Dactor Clinic</string>
</resources>
""",
    "app/src/main/res/values/colors.xml": """\
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="purple_200">#FFBB86FC</color>
    <color name="purple_500">#FF6200EE</color>
    <color name="purple_700">#FF3700B3</color>
    <color name="teal_200">#FF03DAC5</color>
    <color name="teal_700">#FF018786</color>
    <color name="black">#FF000000</color>
    <color name="white">#FFFFFFFF</color>
</resources>
""",
    "app/src/main/res/values/themes.xml": """\
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.DactorClinic" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
""",
    "app/src/main/res/xml/backup_rules.xml": """\
<?xml version="1.0" encoding="utf-8"?>
<full-backup-content xmlns:android="http://schemas.android.com/apk/res/android">
    <include domain="sharedpref" path="."/>
</full-backup-content>
""",
    "app/src/main/res/xml/data_extraction_rules.xml": """\
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <include domain="sharedpref" path="."/>
    </cloud-backup>
</data-extraction-rules>
""",
    "app/src/main/java/com/dactor/clinic/DactorClinicApp.kt": """\
package com.dactor.clinic

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class DactorClinicApp : Application()
""",
    "app/src/main/java/com/dactor/clinic/MainActivity.kt": """\
package com.dactor.clinic

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.dactor.clinic.ui.navigation.DactorClinicNavHost
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    DactorClinicNavHost()
                }
            }
        }
    }
}
""",
    "app/src/main/java/com/dactor/clinic/di/AppModule.kt": """\
package com.dactor.clinic.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideSupabaseClient(): SupabaseClient {
        return createSupabaseClient(
            supabaseUrl = "https://ojfoofojcpabqegxmsab.supabase.co",
            supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y"
        ) {
            install(Auth)
            install(Postgrest)
            install(Storage)
            install(Realtime)
        }
    }
}
""",
    "app/src/main/java/com/dactor/clinic/data/model/Profile.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    @SerialName("id") val id: String,
    @SerialName("email") val email: String,
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("role") val role: String? = null,
    @SerialName("phone") val phone: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/Clinic.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Clinic(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("type") val type: String? = null,
    @SerialName("verification_status") val verificationStatus: String? = null,
    @SerialName("contact_phone") val contactPhone: String? = null,
    @SerialName("contact_email") val contactEmail: String? = null,
    @SerialName("address_text") val addressText: String? = null,
    @SerialName("latitude") val latitude: Double? = null,
    @SerialName("longitude") val longitude: Double? = null,
    @SerialName("auto_notify_threshold") val autoNotifyThreshold: Int? = null,
    @SerialName("description") val description: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/ClinicService.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicService(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("service_name") val serviceName: String,
    @SerialName("description") val description: String? = null,
    @SerialName("price") val price: Double
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/Doctor.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Doctor(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("full_name") val fullName: String,
    @SerialName("email") val email: String,
    @SerialName("specialty") val specialty: String? = null,
    @SerialName("nmc_license_number") val nmcLicenseNumber: String? = null,
    @SerialName("license_doc_url") val licenseDocUrl: String? = null,
    @SerialName("certificates_doc_url") val certificatesDocUrl: String? = null,
    @SerialName("kyc_status") val kycStatus: String? = null,
    @SerialName("is_in_clinic") val isInClinic: Boolean = false,
    @SerialName("consultation_fee") val consultationFee: Double? = null
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/Slot.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Slot(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("slot_date") val slotDate: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("end_time") val endTime: String,
    @SerialName("max_capacity") val maxCapacity: Int,
    @SerialName("booked_count") val bookedCount: Int = 0,
    @SerialName("is_published") val isPublished: Boolean = false
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/Appointment.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Appointment(
    @SerialName("id") val id: String,
    @SerialName("tracking_code_10_digit") val trackingCode10Digit: String,
    @SerialName("slot_id") val slotId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("patient_name") val patientName: String,
    @SerialName("patient_age") val patientAge: Int? = null,
    @SerialName("patient_gender") val patientGender: String? = null,
    @SerialName("patient_mobile") val patientMobile: String,
    @SerialName("patient_email") val patientEmail: String? = null,
    @SerialName("payment_status") val paymentStatus: String? = null,
    @SerialName("checkin_status") val checkinStatus: String? = null,
    @SerialName("appointment_date") val appointmentDate: String,
    @SerialName("appointment_time") val appointmentTime: String,
    @SerialName("fee_amount") val feeAmount: Double,
    @SerialName("is_walkin") val isWalkin: Boolean = false
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/QueueEntry.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class QueueEntry(
    @SerialName("id") val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("doctor_id") val doctorId: String,
    @SerialName("queue_position") val queuePosition: Int,
    @SerialName("status") val status: String,
    @SerialName("called_at") val calledAt: String? = null,
    @SerialName("inside_at") val insideAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/CatalogItem.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CatalogItem(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("item_name") val itemName: String,
    @SerialName("category") val category: String? = null,
    @SerialName("price") val price: Double
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/BillingInvoice.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class BillingInvoice(
    @SerialName("id") val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("items") val items: String, // Stored as JSONB string
    @SerialName("total_amount") val totalAmount: Double,
    @SerialName("paid_amount") val paidAmount: Double = 0.0,
    @SerialName("balance_due") val balanceDue: Double,
    @SerialName("payment_status") val paymentStatus: String,
    @SerialName("paid_at") val paidAt: String? = null,
    @SerialName("remarks") val remarks: String? = null
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/InvoiceItem.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InvoiceItem(
    @SerialName("item_name") val itemName: String,
    @SerialName("quantity") val quantity: Int,
    @SerialName("price") val price: Double,
    @SerialName("total") val total: Double
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/LabReport.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LabReport(
    @SerialName("id") val id: String,
    @SerialName("appointment_id") val appointmentId: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("test_name") val testName: String,
    @SerialName("stage") val stage: String,
    @SerialName("file_url") val fileUrl: String? = null,
    @SerialName("file_name") val fileName: String? = null,
    @SerialName("file_type") val fileType: String? = null,
    @SerialName("patient_name_verification") val patientNameVerification: String? = null,
    @SerialName("sample_collected_at") val sampleCollectedAt: String? = null,
    @SerialName("prepared_at") val preparedAt: String? = null
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/ClinicInvitation.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClinicInvitation(
    @SerialName("id") val id: String,
    @SerialName("clinic_id") val clinicId: String,
    @SerialName("email") val email: String,
    @SerialName("role") val role: String,
    @SerialName("status") val status: String,
    @SerialName("created_at") val createdAt: String? = null
)
""",
    "app/src/main/java/com/dactor/clinic/data/model/DactorNotification.kt": """\
package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DactorNotification(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("appointment_id") val appointmentId: String? = null,
    @SerialName("title") val title: String,
    @SerialName("message") val message: String,
    @SerialName("type") val type: String? = null,
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null
)
""",
    "app/src/main/java/com/dactor/clinic/domain/util/TrackingCodeGenerator.kt": """\
package com.dactor.clinic.domain.util

import kotlin.random.Random

object TrackingCodeGenerator {
    fun generate10DigitCode(): String {
        return (1..10).joinToString("") { Random.nextInt(0, 10).toString() }
    }
}
""",
    "app/src/main/java/com/dactor/clinic/domain/util/CurrencyFormatter.kt": """\
package com.dactor.clinic.domain.util

import java.text.NumberFormat
import java.util.Locale

object CurrencyFormatter {
    fun formatNPR(amount: Double): String {
        val format = NumberFormat.getCurrencyInstance(Locale("en", "NP"))
        return format.format(amount)
    }
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/AuthRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class AuthRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    // Stubs for auth operations
    suspend fun signUp() {}
    suspend fun signIn() {}
    suspend fun signOut() {}
    fun getCurrentUser() = null
    fun isLoggedIn() = false
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/ClinicRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class ClinicRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getClinicById(id: String) {}
    suspend fun updateClinic() {}
    suspend fun updateClinicType() {}
    suspend fun getClinicServices() {}
    suspend fun addService() {}
    suspend fun updateService() {}
    suspend fun deleteService() {}
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/DoctorRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class DoctorRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getDoctorsByClinic() {}
    suspend fun updateDoctor() {}
    suspend fun toggleDoctorPresence() {}
    suspend fun getDoctorById(id: String) {}
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/SlotRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class SlotRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getSlots() {}
    suspend fun createSlot() {}
    suspend fun deleteSlot() {}
    suspend fun updateSlot() {}
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/AppointmentRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class AppointmentRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getAppointmentsByClinic() {}
    suspend fun getAppointmentsByDate() {}
    suspend fun createWalkinAppointment() {}
    suspend fun rescheduleAppointment() {}
    suspend fun getAppointmentByTrackingCode() {}
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/QueueRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class QueueRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getQueueForClinic() {}
    suspend fun updateQueueStatus() {}
    suspend fun reorderQueue() {}
    fun subscribeToQueueUpdates() {}
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/BillingRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class BillingRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getInvoiceByAppointment() {}
    suspend fun updateInvoice() {}
    suspend fun getCatalog() {}
    suspend fun addCatalogItem() {}
    suspend fun updateCatalogItem() {}
    suspend fun deleteCatalogItem() {}
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/LabReportRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class LabReportRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun getLabReports() {}
    suspend fun updateLabReportStage() {}
    suspend fun uploadReportFile() {}
}
""",
    "app/src/main/java/com/dactor/clinic/data/repository/InvitationRepository.kt": """\
package com.dactor.clinic.data.repository

import io.github.jan.supabase.SupabaseClient
import javax.inject.Inject

class InvitationRepository @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    suspend fun sendInvitation() {}
    suspend fun getInvitations() {}
    suspend fun respondToInvitation() {}
}
""",
    "app/src/main/java/com/dactor/clinic/ui/navigation/NavRoutes.kt": """\
package com.dactor.clinic.ui.navigation

object NavRoutes {
    const val ClinicLogin = "clinic_login"
    const val ClinicRegister = "clinic_register"
    const val DoctorLogin = "doctor_login"
    const val DoctorRegister = "doctor_register"
    const val DoctorKYC = "doctor_kyc"
    const val Dashboard = "dashboard"
    const val SlotManager = "slot_manager"
    const val QueueBoard = "queue_board"
    const val PatientDirectory = "patient_directory"
    const val PatientDetail = "patient_detail"
    const val BillingScreen = "billing_screen"
    const val CatalogManager = "catalog_manager"
    const val FutureAppointments = "future_appointments"
    const val WalkinBooking = "walkin_booking"
    const val LabWorkflow = "lab_workflow"
    const val InvitationManager = "invitation_manager"
    const val ClinicSettings = "clinic_settings"
    const val ServicesScreen = "services_screen"
}
""",
    "app/src/main/java/com/dactor/clinic/ui/navigation/DactorClinicNavHost.kt": """\
package com.dactor.clinic.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dactor.clinic.ui.auth.*
import com.dactor.clinic.ui.dashboard.DashboardScreen
import com.dactor.clinic.ui.slots.SlotManagerScreen
import com.dactor.clinic.ui.queue.QueueBoardScreen
import com.dactor.clinic.ui.patients.PatientDirectoryScreen
import com.dactor.clinic.ui.patients.PatientDetailScreen
import com.dactor.clinic.ui.billing.BillingScreen
import com.dactor.clinic.ui.billing.CatalogManagerScreen
import com.dactor.clinic.ui.appointments.FutureAppointmentsScreen
import com.dactor.clinic.ui.walkin.WalkinBookingScreen
import com.dactor.clinic.ui.lab.LabWorkflowScreen
import com.dactor.clinic.ui.invitations.InvitationManagerScreen
import com.dactor.clinic.ui.settings.ClinicSettingsScreen
import com.dactor.clinic.ui.services.ServicesScreen

@Composable
fun DactorClinicNavHost() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = NavRoutes.ClinicLogin) {
        composable(NavRoutes.ClinicLogin) { ClinicLoginScreen(navController) }
        composable(NavRoutes.ClinicRegister) { ClinicRegisterScreen(navController) }
        composable(NavRoutes.DoctorLogin) { DoctorLoginScreen(navController) }
        composable(NavRoutes.DoctorRegister) { DoctorRegisterScreen(navController) }
        composable(NavRoutes.DoctorKYC) { DoctorKYCScreen(navController) }
        composable(NavRoutes.Dashboard) { DashboardScreen(navController) }
        composable(NavRoutes.SlotManager) { SlotManagerScreen(navController) }
        composable(NavRoutes.QueueBoard) { QueueBoardScreen(navController) }
        composable(NavRoutes.PatientDirectory) { PatientDirectoryScreen(navController) }
        composable(NavRoutes.PatientDetail) { PatientDetailScreen(navController) }
        composable(NavRoutes.BillingScreen) { BillingScreen(navController) }
        composable(NavRoutes.CatalogManager) { CatalogManagerScreen(navController) }
        composable(NavRoutes.FutureAppointments) { FutureAppointmentsScreen(navController) }
        composable(NavRoutes.WalkinBooking) { WalkinBookingScreen(navController) }
        composable(NavRoutes.LabWorkflow) { LabWorkflowScreen(navController) }
        composable(NavRoutes.InvitationManager) { InvitationManagerScreen(navController) }
        composable(NavRoutes.ClinicSettings) { ClinicSettingsScreen(navController) }
        composable(NavRoutes.ServicesScreen) { ServicesScreen(navController) }
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/auth/ClinicLoginScreen.kt": """\
package com.dactor.clinic.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import com.dactor.clinic.ui.navigation.NavRoutes

@Composable
fun ClinicLoginScreen(navController: NavController) {
    Column {
        Text("Clinic Login")
        Button(onClick = { navController.navigate(NavRoutes.Dashboard) }) {
            Text("Login")
        }
        TextButton(onClick = { navController.navigate(NavRoutes.ClinicRegister) }) {
            Text("Register")
        }
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/auth/ClinicRegisterScreen.kt": """\
package com.dactor.clinic.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun ClinicRegisterScreen(navController: NavController) {
    Column {
        Text("Clinic Register")
        Button(onClick = { navController.popBackStack() }) {
            Text("Register")
        }
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/auth/DoctorLoginScreen.kt": """\
package com.dactor.clinic.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun DoctorLoginScreen(navController: NavController) {
    Column {
        Text("Doctor Login")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/auth/DoctorRegisterScreen.kt": """\
package com.dactor.clinic.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun DoctorRegisterScreen(navController: NavController) {
    Column {
        Text("Doctor Register")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/auth/DoctorKYCScreen.kt": """\
package com.dactor.clinic.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun DoctorKYCScreen(navController: NavController) {
    Column {
        Text("Doctor KYC")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/dashboard/DashboardScreen.kt": """\
package com.dactor.clinic.ui.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun DashboardScreen(navController: NavController) {
    Column {
        Text("Dashboard")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/services/ServicesScreen.kt": """\
package com.dactor.clinic.ui.services

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun ServicesScreen(navController: NavController) {
    Column {
        Text("Services")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/slots/SlotManagerScreen.kt": """\
package com.dactor.clinic.ui.slots

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun SlotManagerScreen(navController: NavController) {
    Column {
        Text("Slot Manager")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/queue/QueueBoardScreen.kt": """\
package com.dactor.clinic.ui.queue

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun QueueBoardScreen(navController: NavController) {
    Column {
        Text("Queue Board")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/patients/PatientDirectoryScreen.kt": """\
package com.dactor.clinic.ui.patients

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun PatientDirectoryScreen(navController: NavController) {
    Column {
        Text("Patient Directory")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/patients/PatientDetailScreen.kt": """\
package com.dactor.clinic.ui.patients

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun PatientDetailScreen(navController: NavController) {
    Column {
        Text("Patient Detail")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/billing/BillingScreen.kt": """\
package com.dactor.clinic.ui.billing

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun BillingScreen(navController: NavController) {
    Column {
        Text("Billing Screen")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/billing/CatalogManagerScreen.kt": """\
package com.dactor.clinic.ui.billing

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun CatalogManagerScreen(navController: NavController) {
    Column {
        Text("Catalog Manager")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/appointments/FutureAppointmentsScreen.kt": """\
package com.dactor.clinic.ui.appointments

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun FutureAppointmentsScreen(navController: NavController) {
    Column {
        Text("Future Appointments")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/walkin/WalkinBookingScreen.kt": """\
package com.dactor.clinic.ui.walkin

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun WalkinBookingScreen(navController: NavController) {
    Column {
        Text("Walkin Booking")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/lab/LabWorkflowScreen.kt": """\
package com.dactor.clinic.ui.lab

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun LabWorkflowScreen(navController: NavController) {
    Column {
        Text("Lab Workflow")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/invitations/InvitationManagerScreen.kt": """\
package com.dactor.clinic.ui.invitations

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun InvitationManagerScreen(navController: NavController) {
    Column {
        Text("Invitation Manager")
    }
}
""",
    "app/src/main/java/com/dactor/clinic/ui/settings/ClinicSettingsScreen.kt": """\
package com.dactor.clinic.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.navigation.NavController

@Composable
fun ClinicSettingsScreen(navController: NavController) {
    Column {
        Text("Clinic Settings")
    }
}
"""
}

for rel_path, content in files.items():
    full_path = os.path.join(project_dir, rel_path.replace("/", "\\"))
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Project generated successfully!")
