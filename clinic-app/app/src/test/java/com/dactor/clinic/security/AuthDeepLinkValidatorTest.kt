package com.dactor.clinic.security

import com.dactor.clinic.data.security.AuthDeepLinkValidator
import com.dactor.clinic.data.security.AuthDeepLinkValidator.ValidationResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Comprehensive requirements-driven test suite for AuthDeepLinkValidator.
 * Covers:
 * - Tier 1: Core Features & Happy Paths (PKCE, Implicit Fragment Tokens, Trailing Slashes)
 * - Tier 2: Boundaries & Malformed Inputs (Null, Empty, Whitespace, Blank Params, Syntax Errors)
 * - Tier 3: Combinations & Protocol Variations (Wrong Scheme, Wrong Host, Wrong Path, Error Tokens)
 * - Tier 4: Real-World Scenarios (Malicious App Hijacking, Expired OTP, User Cancellation)
 */
class AuthDeepLinkValidatorTest {

    // =========================================================================
    // Tier 1: Core Feature Happy Paths
    // =========================================================================

    @Test
    fun testValidPkceCallback_standard() {
        val uri = "dactor://auth/callback?code=valid-pkce-auth-code-12345"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Expected Valid result for standard PKCE callback", result is ValidationResult.Valid)
        val valid = result as ValidationResult.Valid
        assertEquals("valid-pkce-auth-code-12345", valid.code)
        assertNull("Access token must be null for PKCE code flow", valid.accessToken)
        assertNull("Refresh token must be null for PKCE code flow", valid.refreshToken)
        assertTrue("isValid helper must return true", AuthDeepLinkValidator.isValid(uri))
    }

    @Test
    fun testValidTokenFragment_implicitFlow() {
        val uri = "dactor://auth/callback#access_token=token-abc-999&refresh_token=refresh-xyz-888"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Expected Valid result for fragment token callback", result is ValidationResult.Valid)
        val valid = result as ValidationResult.Valid
        assertNull("Code must be null for implicit fragment token flow", valid.code)
        assertEquals("token-abc-999", valid.accessToken)
        assertEquals("refresh-xyz-888", valid.refreshToken)
        assertTrue("isValid helper must return true", AuthDeepLinkValidator.isValid(uri))
    }

    @Test
    fun testValidPkceCallback_withExtraQueryParams() {
        val uri = "dactor://auth/callback?state=csrf-token-abc&code=pkce-code-777&type=signup"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Expected Valid result despite additional query parameters", result is ValidationResult.Valid)
        val valid = result as ValidationResult.Valid
        assertEquals("pkce-code-777", valid.code)
    }

    @Test
    fun testValidTokenFragment_withExtraFragmentParams() {
        val uri = "dactor://auth/callback#access_token=tok123&token_type=bearer&expires_in=3600&refresh_token=ref456"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Expected Valid result with extra fragment parameters", result is ValidationResult.Valid)
        val valid = result as ValidationResult.Valid
        assertEquals("tok123", valid.accessToken)
        assertEquals("ref456", valid.refreshToken)
    }

    @Test
    fun testValidPkceCallback_withTrailingSlash() {
        val uri = "dactor://auth/callback/?code=trailing-slash-code"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Expected Valid result with trailing slash in path", result is ValidationResult.Valid)
        assertEquals("trailing-slash-code", (result as ValidationResult.Valid).code)
    }

    @Test
    fun testStrictAuthCallback_matchingComponents() {
        assertTrue(AuthDeepLinkValidator.isStrictAuthCallback("dactor", "auth", "/callback"))
        assertTrue(AuthDeepLinkValidator.isStrictAuthCallback("DACTOR", "AUTH", "/callback/"))
        assertTrue(AuthDeepLinkValidator.isStrictAuthCallback("dactor://auth/callback?code=123"))
        assertTrue(AuthDeepLinkValidator.isStrictAuthCallback("dactor://auth/callback/"))
    }

    // =========================================================================
    // Tier 2: Boundaries & Malformed Inputs
    // =========================================================================

    @Test
    fun testRejectNullUri() {
        val result = AuthDeepLinkValidator.validate(null as String?)
        assertTrue("Null URI must return InvalidUri", result is ValidationResult.InvalidUri)
        assertFalse(AuthDeepLinkValidator.isValid(null))
        assertFalse(AuthDeepLinkValidator.isStrictAuthCallback(null))
    }

    @Test
    fun testRejectEmptyUri() {
        val result = AuthDeepLinkValidator.validate("")
        assertTrue("Empty URI must return InvalidUri", result is ValidationResult.InvalidUri)
        assertFalse(AuthDeepLinkValidator.isValid(""))
    }

    @Test
    fun testRejectWhitespaceOnlyUri() {
        val result = AuthDeepLinkValidator.validate("   \t  \n ")
        assertTrue("Whitespace URI must return InvalidUri", result is ValidationResult.InvalidUri)
        assertFalse(AuthDeepLinkValidator.isValid("   "))
    }

    @Test
    fun testRejectMalformedUriSyntax() {
        val malformedCases = listOf(
            "://auth/callback?code=123",
            "dactor://",
            "dactor:",
            "dactor://?code=123",
            "dactor:///callback?code=123",
            "dactor::auth/callback?code=123",
            "not a valid uri string [brackets]"
        )
        for (malformed in malformedCases) {
            val result = AuthDeepLinkValidator.validate(malformed)
            assertTrue("Malformed URI '$malformed' must return InvalidUri", result is ValidationResult.InvalidUri)
            assertFalse(AuthDeepLinkValidator.isValid(malformed))
        }
    }

    @Test
    fun testRejectEmptyOrBlankParameters() {
        val emptyParams = listOf(
            "dactor://auth/callback?code=",
            "dactor://auth/callback?code=   ",
            "dactor://auth/callback#access_token=&refresh_token=",
            "dactor://auth/callback#access_token=   &refresh_token=   "
        )
        for (uri in emptyParams) {
            val result = AuthDeepLinkValidator.validate(uri)
            assertTrue("Empty param URI '$uri' must return InvalidUri", result is ValidationResult.InvalidUri)
            assertFalse(AuthDeepLinkValidator.isValid(uri))
        }
    }

    @Test
    fun testRejectPartialFragmentTokens() {
        // Missing refresh_token
        val onlyAccess = "dactor://auth/callback#access_token=only_access"
        assertTrue(AuthDeepLinkValidator.validate(onlyAccess) is ValidationResult.InvalidUri)

        // Missing access_token
        val onlyRefresh = "dactor://auth/callback#refresh_token=only_refresh"
        assertTrue(AuthDeepLinkValidator.validate(onlyRefresh) is ValidationResult.InvalidUri)
    }

    @Test
    fun testRejectCallbackWithoutAuthPayload() {
        val noPayloads = listOf(
            "dactor://auth/callback",
            "dactor://auth/callback/",
            "dactor://auth/callback?unrelated_param=12345",
            "dactor://auth/callback#unrelated_fragment=67890"
        )
        for (uri in noPayloads) {
            val result = AuthDeepLinkValidator.validate(uri)
            assertTrue("URI without auth tokens '$uri' must return InvalidUri", result is ValidationResult.InvalidUri)
            assertFalse(AuthDeepLinkValidator.isValid(uri))
        }
    }

    // =========================================================================
    // Tier 3: Combinations & Protocol Variations
    // =========================================================================

    @Test
    fun testRejectWrongScheme() {
        val wrongSchemes = listOf(
            "https://auth/callback?code=123",
            "http://auth/callback?code=123",
            "myapp://auth/callback?code=123",
            "file://auth/callback?code=123",
            "content://auth/callback?code=123",
            "custom://auth/callback?code=123"
        )
        for (uri in wrongSchemes) {
            val result = AuthDeepLinkValidator.validate(uri)
            assertTrue("Wrong scheme URI '$uri' must return InvalidUri", result is ValidationResult.InvalidUri)
            assertFalse(AuthDeepLinkValidator.isValid(uri))
        }
    }

    @Test
    fun testRejectWrongHost() {
        val wrongHosts = listOf(
            "dactor://malicious/attack?code=123",
            "dactor://settings/callback?code=123",
            "dactor://dashboard/callback?code=123",
            "dactor://callback?code=123",
            "dactor://auth.example.com/callback?code=123",
            "dactor://login/callback?code=123"
        )
        for (uri in wrongHosts) {
            val result = AuthDeepLinkValidator.validate(uri)
            assertTrue("Wrong host URI '$uri' must return InvalidUri", result is ValidationResult.InvalidUri)
            assertFalse(AuthDeepLinkValidator.isValid(uri))
            assertFalse(AuthDeepLinkValidator.isStrictAuthCallback(uri))
        }
    }

    @Test
    fun testRejectWrongPath() {
        val wrongPaths = listOf(
            "dactor://auth/login?code=123",
            "dactor://auth/callback/extra?code=123",
            "dactor://auth/verify?code=123",
            "dactor://auth?code=123",
            "dactor://auth/?code=123",
            "dactor://auth/callback123?code=123"
        )
        for (uri in wrongPaths) {
            val result = AuthDeepLinkValidator.validate(uri)
            assertTrue("Wrong path URI '$uri' must return InvalidUri", result is ValidationResult.InvalidUri)
            assertFalse(AuthDeepLinkValidator.isValid(uri))
            assertFalse(AuthDeepLinkValidator.isStrictAuthCallback(uri))
        }
    }

    @Test
    fun testDetectQueryAuthErrors() {
        val uri = "dactor://auth/callback?error=access_denied&error_code=403&error_description=Denied+by+user"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Expected AuthError result", result is ValidationResult.AuthError)
        val authError = result as ValidationResult.AuthError
        assertEquals("access_denied", authError.error)
        assertEquals("403", authError.errorCode)
        assertEquals("Denied by user", authError.errorDescription)
        assertFalse("isValid must return false on error", AuthDeepLinkValidator.isValid(uri))
    }

    @Test
    fun testDetectFragmentAuthErrors() {
        val uri = "dactor://auth/callback#error=unauthorized_client&error_code=401&error_description=Client+not+allowed"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Expected AuthError result from fragment", result is ValidationResult.AuthError)
        val authError = result as ValidationResult.AuthError
        assertEquals("unauthorized_client", authError.error)
        assertEquals("401", authError.errorCode)
        assertEquals("Client not allowed", authError.errorDescription)
    }

    @Test
    fun testAuthErrorPrecedenceOverTokens() {
        // If an attacker crafts a URI with an error AND a code, error MUST take precedence
        val uri = "dactor://auth/callback?error=server_error&code=fake-code-123"
        val result = AuthDeepLinkValidator.validate(uri)

        assertTrue("Error parameter must take precedence over code parameter", result is ValidationResult.AuthError)
        assertEquals("server_error", (result as ValidationResult.AuthError).error)
    }

    @Test
    fun testStrictAuthCallback_componentRejections() {
        assertFalse(AuthDeepLinkValidator.isStrictAuthCallback("https", "auth", "/callback"))
        assertFalse(AuthDeepLinkValidator.isStrictAuthCallback("dactor", "wrong_host", "/callback"))
        assertFalse(AuthDeepLinkValidator.isStrictAuthCallback("dactor", "auth", "/wrong_path"))
        assertFalse(AuthDeepLinkValidator.isStrictAuthCallback(null, "auth", "/callback"))
        assertFalse(AuthDeepLinkValidator.isStrictAuthCallback("dactor", null, "/callback"))
        assertFalse(AuthDeepLinkValidator.isStrictAuthCallback("dactor", "auth", null))
    }

    // =========================================================================
    // Tier 4: Real-World Scenarios & Resiliency
    // =========================================================================

    @Test
    fun testScenario_MaliciousAppDeepLinkHijackAttempt() {
        // An external malicious app broadcasts dactor://malicious/attack or dactor://settings
        val maliciousBroadcasts = listOf(
            "dactor://malicious/attack",
            "dactor://exploit/bypass?admin=true",
            "dactor://auth_bypass/login",
            "dactor://settings/profile"
        )
        for (intentUri in maliciousBroadcasts) {
            val result = AuthDeepLinkValidator.validate(intentUri)
            assertTrue("Malicious attempt '$intentUri' must be rejected", result is ValidationResult.InvalidUri)
            assertFalse(AuthDeepLinkValidator.isValid(intentUri))
        }
    }

    @Test
    fun testScenario_SupabaseExpiredOtpCallback() {
        // User clicks an expired email confirmation link from Gmail
        val expiredCallback = "dactor://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
        val result = AuthDeepLinkValidator.validate(expiredCallback)

        assertTrue(result is ValidationResult.AuthError)
        val error = result as ValidationResult.AuthError
        assertEquals("access_denied", error.error)
        assertEquals("otp_expired", error.errorCode)
        assertNotNull(error.errorDescription)
        assertTrue(error.errorDescription!!.contains("expired"))
    }

    @Test
    fun testScenario_SupabaseUserCancelledFlow() {
        val cancelledCallback = "dactor://auth/callback?error=user_cancelled&error_description=User+declined+authorization"
        val result = AuthDeepLinkValidator.validate(cancelledCallback)

        assertTrue(result is ValidationResult.AuthError)
        assertEquals("user_cancelled", (result as ValidationResult.AuthError).error)
    }

    @Test
    fun testScenario_LegitimateSupabasePkceExchange() {
        // Real-world Supabase PKCE confirmation redirect
        val legitimateCallback = "dactor://auth/callback?code=7b8483f2-8924-42f1-bd56-c7412f1cf440"
        val result = AuthDeepLinkValidator.validate(legitimateCallback)

        assertTrue(result is ValidationResult.Valid)
        assertEquals("7b8483f2-8924-42f1-bd56-c7412f1cf440", (result as ValidationResult.Valid).code)
    }

    @Test
    fun testScenario_QueryParameterOrderingPermutations() {
        val perm1 = "dactor://auth/callback?state=csrf123&code=pkce-middle&scope=profile"
        val perm2 = "dactor://auth/callback/?scope=profile&state=csrf123&code=pkce-end"
        val perm3 = "dactor://auth/callback?code=pkce-first&scope=profile&state=csrf123"

        assertEquals("pkce-middle", (AuthDeepLinkValidator.validate(perm1) as ValidationResult.Valid).code)
        assertEquals("pkce-end", (AuthDeepLinkValidator.validate(perm2) as ValidationResult.Valid).code)
        assertEquals("pkce-first", (AuthDeepLinkValidator.validate(perm3) as ValidationResult.Valid).code)
    }

    @Test
    fun testScenario_UrlEncodedMetaCharacters() {
        val encodedCallback = "dactor://auth/callback?code=code%2Bwith%2Bplus%3Dand%3Dequal%26amp"
        val result = AuthDeepLinkValidator.validate(encodedCallback)

        assertTrue(result is ValidationResult.Valid)
        assertEquals("code+with+plus=and=equal&amp", (result as ValidationResult.Valid).code)

        val encodedError = "dactor://auth/callback?error=custom_err&error_description=Hello%20World%21%20%28Testing%29"
        val errorResult = AuthDeepLinkValidator.validate(encodedError)
        assertTrue(errorResult is ValidationResult.AuthError)
        assertEquals("Hello World! (Testing)", (errorResult as ValidationResult.AuthError).errorDescription)
    }
}
