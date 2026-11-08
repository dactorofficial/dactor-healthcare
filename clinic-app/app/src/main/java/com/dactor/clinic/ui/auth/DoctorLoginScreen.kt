package com.dactor.clinic.ui.auth

import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import com.dactor.clinic.data.repository.AuthRepository
import com.dactor.clinic.data.repository.ClinicRepository
import com.dactor.clinic.data.repository.DoctorRepository

@Composable
fun DoctorLoginScreen(
    navController: NavController,
    authRepository: AuthRepository? = null,
    doctorRepository: DoctorRepository? = null,
    clinicRepository: ClinicRepository? = null
) {
    ClinicLoginScreen(
        navController = navController,
        authRepository = authRepository,
        doctorRepository = doctorRepository,
        clinicRepository = clinicRepository,
        initialTab = 1
    )
}
