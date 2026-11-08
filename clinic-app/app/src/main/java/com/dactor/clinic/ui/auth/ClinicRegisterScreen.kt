package com.dactor.clinic.ui.auth

import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import com.dactor.clinic.data.local.RegistrationDraftManager
import com.dactor.clinic.data.repository.AuthRepository
import com.dactor.clinic.data.repository.ClinicRepository

@Composable
fun ClinicRegisterScreen(
    navController: NavController,
    clinicRepository: ClinicRepository? = null,
    authRepository: AuthRepository? = null,
    draftManager: RegistrationDraftManager? = null
) {
    ClinicLoginScreen(
        navController = navController,
        authRepository = authRepository,
        clinicRepository = clinicRepository,
        draftManager = draftManager,
        initialTab = 0
    )
}
