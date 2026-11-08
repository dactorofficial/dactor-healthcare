package com.dactor.clinic.data.security

import java.net.URI
import java.net.URLDecoder

object AuthDeepLinkValidator {

    const val SCHEME = "dactor"
    const val HOST = "auth"
    const val PATH = "/callback"

    sealed class ValidationResult {
        data class Valid(
            val code: String? = null,
            val accessToken: String? = null,
            val refreshToken: String? = null
        ) : ValidationResult()

        data class AuthError(
            val error: String,
            val errorCode: String? = null,
            val errorDescription: String? = null
        ) : ValidationResult()

        object InvalidUri : ValidationResult()
    }

    /**
     * Checks if scheme, host, and path strictly match dactor://auth/callback
     */
    fun isStrictAuthCallback(scheme: String?, host: String?, path: String?): Boolean {
        if (!SCHEME.equals(scheme, ignoreCase = true)) return false
        if (!HOST.equals(host, ignoreCase = true)) return false
        val normalizedPath = path?.trimEnd('/') ?: ""
        return normalizedPath == PATH
    }

    fun isStrictAuthCallback(uriString: String?): Boolean {
        if (uriString.isNullOrBlank()) return false
        return try {
            val uri = URI(uriString.trim())
            isStrictAuthCallback(uri.scheme, uri.host, uri.path)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Validates a raw URI string.
     */
    fun validate(uriString: String?): ValidationResult {
        if (uriString.isNullOrBlank()) return ValidationResult.InvalidUri

        val uri = try {
            URI(uriString.trim())
        } catch (_: Exception) {
            return ValidationResult.InvalidUri
        }

        // 1. Strict Scheme Check
        val scheme = uri.scheme
        if (!SCHEME.equals(scheme, ignoreCase = true)) {
            return ValidationResult.InvalidUri
        }

        // 2. Strict Host Check
        val host = uri.host
        if (!HOST.equals(host, ignoreCase = true)) {
            return ValidationResult.InvalidUri
        }

        // 3. Strict Path Check (/callback or /callback/)
        val rawPath = uri.path ?: ""
        val normalizedPath = rawPath.trimEnd('/')
        if (normalizedPath != PATH) {
            return ValidationResult.InvalidUri
        }

        // 4. Extract parameters from Query and Fragment
        val queryParams = parseParams(uri.rawQuery)
        val fragmentParams = parseParams(uri.rawFragment)

        // 5. Check for Auth Error Tokens in query or fragment
        val error = queryParams["error"] ?: fragmentParams["error"]
        val errorCode = queryParams["error_code"] ?: fragmentParams["error_code"]
        val errorDesc = queryParams["error_description"] ?: fragmentParams["error_description"]

        if (!error.isNullOrBlank() || !errorCode.isNullOrBlank()) {
            return ValidationResult.AuthError(
                error = error ?: "unknown_error",
                errorCode = errorCode?.ifBlank { null },
                errorDescription = errorDesc?.ifBlank { null }
            )
        }

        // 6. Check for PKCE Code
        val code = queryParams["code"] ?: fragmentParams["code"]
        if (!code.isNullOrBlank()) {
            return ValidationResult.Valid(code = code)
        }

        // 7. Check for Access Token & Refresh Token (implicit flow)
        val accessToken = fragmentParams["access_token"] ?: queryParams["access_token"]
        val refreshToken = fragmentParams["refresh_token"] ?: queryParams["refresh_token"]
        if (!accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()) {
            return ValidationResult.Valid(
                accessToken = accessToken,
                refreshToken = refreshToken
            )
        }

        // No valid auth payload found
        return ValidationResult.InvalidUri
    }

    /**
     * Overload for android.net.Uri
     */
    fun validate(uri: android.net.Uri?): ValidationResult {
        if (uri == null) return ValidationResult.InvalidUri
        return validate(uri.toString())
    }

    fun isValid(uriString: String?): Boolean {
        return validate(uriString) is ValidationResult.Valid
    }

    private fun parseParams(rawString: String?): Map<String, String> {
        if (rawString.isNullOrBlank()) return emptyMap()
        return rawString.split("&").mapNotNull { pair ->
            if (pair.isBlank()) return@mapNotNull null
            val idx = pair.indexOf('=')
            if (idx != -1) {
                val key = decode(pair.substring(0, idx))
                val value = decode(pair.substring(idx + 1))
                if (key.isNotBlank()) key to value else null
            } else {
                val key = decode(pair)
                if (key.isNotBlank()) key to "" else null
            }
        }.toMap()
    }

    private fun decode(s: String): String {
        return try {
            URLDecoder.decode(s, "UTF-8")
        } catch (_: Exception) {
            s
        }
    }
}
