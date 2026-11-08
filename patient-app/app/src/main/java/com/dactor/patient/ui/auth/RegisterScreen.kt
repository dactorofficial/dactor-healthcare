package com.dactor.patient.ui.auth

import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import com.dactor.patient.data.local.RegistrationDraftManager
import com.dactor.patient.data.local.UserSessionManager
import com.dactor.patient.data.repository.AuthRepository

@Composable
fun RegisterScreen(
    navController: NavController,
    authRepository: AuthRepository? = null,
    draftManager: RegistrationDraftManager? = null,
    sessionManager: UserSessionManager? = null
) {
    LoginScreen(
        navController = navController,
        authRepository = authRepository,
        draftManager = draftManager,
        sessionManager = sessionManager
    )
}
