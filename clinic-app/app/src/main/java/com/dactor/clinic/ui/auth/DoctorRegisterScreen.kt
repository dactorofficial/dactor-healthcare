package com.dactor.clinic.ui.auth

import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import com.dactor.clinic.data.local.RegistrationDraftManager
import com.dactor.clinic.data.repository.AuthRepository
import com.dactor.clinic.data.repository.DoctorRepository

@Composable
fun DoctorRegisterScreen(
    navController: NavController,
    doctorRepository: DoctorRepository? = null,
    authRepository: AuthRepository? = null,
    draftManager: RegistrationDraftManager? = null
) {
    ClinicLoginScreen(
        navController = navController,
        authRepository = authRepository,
        doctorRepository = doctorRepository,
        draftManager = draftManager,
        initialTab = 1
    )
}
