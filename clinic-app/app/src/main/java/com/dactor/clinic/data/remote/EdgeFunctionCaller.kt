package com.dactor.clinic.data.remote

import com.dactor.clinic.di.AppModule
import com.google.firebase.auth.FirebaseAuth
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.gotrue.auth
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URL

/** Server returned an error; [message] is the server's own error text. */
class EdgeFunctionException(val status: Int, message: String) : Exception(message)

/**
 * Calls a Supabase Edge Function as the signed-in user.
 *
 * Clinic staff who sign in with Google are signed in to Firebase only, so the Supabase client has no
 * user token and calls arrive anonymous ("Clinic sign-in required" / "not authorized"). For them the
 * request is sent with `Authorization: Bearer <Firebase ID token>`, which the server trusts
 * (`is_trusted_application_identity` accepts tokens from the dactor-ea1e1 Firebase project).
 * Users with a Supabase session (email / OTP sign-in) keep using the Supabase client unchanged.
 *
 * Returns the response body; throws [EdgeFunctionException] with the server's error text otherwise.
 */
object EdgeFunctionCaller {

    suspend fun call(client: SupabaseClient, function: String, body: JsonObject): String = withContext(Dispatchers.IO) {
        val hasSupabaseSession = runCatching { client.auth.currentSessionOrNull() != null }.getOrDefault(false)
        val firebaseToken = if (hasSupabaseSession) null else runCatching {
            FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.await()?.token
        }.getOrNull()

        if (firebaseToken.isNullOrBlank()) {
            return@withContext client.functions.invoke(function = function, body = body).bodyAsText()
        }

        val connection = (URL("${AppModule.SUPABASE_URL}/functions/v1/$function").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 15_000
            readTimeout = 45_000
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", AppModule.SUPABASE_ANON_KEY)
            setRequestProperty("Authorization", "Bearer $firebaseToken")
        }
        try {
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw EdgeFunctionException(status, serverError(text) ?: "Server error ($status)")
            text
        } finally {
            connection.disconnect()
        }
    }

    private fun serverError(text: String): String? = runCatching {
        Json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull
    }.getOrNull()?.takeIf { it.isNotBlank() }
}
