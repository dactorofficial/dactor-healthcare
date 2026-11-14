package com.dactor.patient.data.cache

import android.content.Context
import android.webkit.WebStorage
import coil.Coil
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.repository.AppointmentRepository
import com.dactor.patient.data.repository.AuthRepository
import com.dactor.patient.data.repository.ClinicRepository
import com.dactor.patient.data.repository.DoctorRepository
import com.dactor.patient.data.repository.QueueRepository
import com.dactor.patient.data.repository.SlotRepository
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppCacheManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionManager: UserSessionManager,
    private val appointmentRepository: AppointmentRepository,
    private val slotRepository: SlotRepository,
    private val clinicRepository: ClinicRepository,
    private val doctorRepository: DoctorRepository,
    private val queueRepository: QueueRepository,
    private val authRepository: AuthRepository
) {
    suspend fun clearAllCache() = withContext(Dispatchers.IO) {
        // 1. Clear In-Memory Caches across all repositories
        runCatching { appointmentRepository.clearCache() }
        runCatching { slotRepository.clearCache() }
        runCatching { clinicRepository.clearCache() }
        runCatching { doctorRepository.clearCache() }
        runCatching { queueRepository.clearCache() }

        // 2. Clear Coil Image Loader Memory and Disk Cache
        runCatching {
            val imageLoader = Coil.imageLoader(context)
            imageLoader.memoryCache?.clear()
            imageLoader.diskCache?.clear()
        }

        // 3. Delete Application Internal Disk Cache Directory
        runCatching { deleteDirectoryContents(context.cacheDir) }

        // 4. Delete Code Cache Directory
        runCatching { deleteDirectoryContents(context.codeCacheDir) }

        // 5. Delete External Cache Directories
        runCatching { context.externalCacheDir?.let { deleteDirectoryContents(it) } }
        runCatching {
            context.externalCacheDirs?.forEach { dir ->
                dir?.let { deleteDirectoryContents(it) }
            }
        }

        // 6. Clear WebView WebStorage Cache
        runCatching { WebStorage.getInstance().deleteAllData() }

        // 7. Clear Session & SharedPreferences Cache (preserving onboarding & terms flags)
        runCatching { sessionManager.clearSession() }

        // 8. Sign out Auth Providers
        runCatching { authRepository.signOut() }
        runCatching {
            GoogleSignIn.getClient(context, GoogleSignInOptions.DEFAULT_SIGN_IN).signOut()
        }
        runCatching { FirebaseAuth.getInstance().signOut() }
    }

    private fun deleteDirectoryContents(dir: File?) {
        if (dir == null || !dir.exists() || !dir.isDirectory) return
        dir.listFiles()?.forEach { file ->
            if (file.isDirectory) {
                deleteDirectoryContents(file)
                file.delete()
            } else {
                file.delete()
            }
        }
    }

    companion object {
        fun getInstance(context: Context): AppCacheManager {
            return EntryPointAccessors.fromApplication(
                context.applicationContext,
                AppCacheManagerEntryPoint::class.java
            ).appCacheManager()
        }
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface AppCacheManagerEntryPoint {
    fun appCacheManager(): AppCacheManager
}
