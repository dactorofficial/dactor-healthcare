package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class GatewayCredentialItem(
    @SerialName("enabled") val enabled: Boolean = false,
    @SerialName("provider_name") val providerName: String = "",
    @SerialName("environment") val environment: String = "live", // "live" or "test"
    @SerialName("merchant_id") val merchantId: String = "",
    @SerialName("public_key") val publicKey: String = "",
    @SerialName("secret_key") val secretKey: String = "",
    @SerialName("account_number") val accountNumber: String = "",
    @SerialName("callback_url") val callbackUrl: String = "",
    @SerialName("is_verified") val isVerified: Boolean = false,
    @SerialName("verified_at") val verifiedAt: String? = null,
    @SerialName("app_id") val appId: String = "",
    @SerialName("app_name") val appName: String = "",
    @SerialName("username") val username: String = "",
    @SerialName("has_secret_key") val hasSecretKey: Boolean = false,
    @SerialName("has_private_key") val hasPrivateKey: Boolean = false,
    @SerialName("has_app_password") val hasAppPassword: Boolean = false
)

@Serializable
data class GatewaySetupStatusNode(
    @SerialName("enabled") val enabled: Boolean = false,
    @SerialName("is_verified") val isVerified: Boolean = false,
    @SerialName("verified_at") val verifiedAt: String? = null,
    @SerialName("environment") val environment: String = "test",
    @SerialName("merchant_id") val merchantId: String = "",
    @SerialName("public_key") val publicKey: String = "",
    @SerialName("merchant_code") val merchantCode: String = "",
    @SerialName("username") val username: String = "",
    @SerialName("app_id") val appId: String = "",
    @SerialName("app_name") val appName: String = "",
    @SerialName("has_secret_key") val hasSecretKey: Boolean = false,
    @SerialName("has_password") val hasPassword: Boolean = false,
    @SerialName("has_app_password") val hasAppPassword: Boolean = false,
    @SerialName("has_private_key") val hasPrivateKey: Boolean = false
)

@Serializable
data class ClinicGatewaySetupStatus(
    @SerialName("is_direct_payment_enabled") val isDirectPaymentEnabled: Boolean = false,
    @SerialName("esewa") val esewa: GatewaySetupStatusNode = GatewaySetupStatusNode(),
    @SerialName("khalti") val khalti: GatewaySetupStatusNode = GatewaySetupStatusNode(),
    @SerialName("fonepay") val fonepay: GatewaySetupStatusNode = GatewaySetupStatusNode(),
    @SerialName("connectips") val connectips: GatewaySetupStatusNode = GatewaySetupStatusNode()
)

@Serializable
data class GatewaySetupEnvelope(
    @SerialName("callbackBaseUrl") val callbackBaseUrl: String? = null,
    @SerialName("setup") val setup: ClinicGatewaySetupStatus? = null,
    @SerialName("error") val error: String? = null
)

@Serializable
data class PaymentGatewaysConfig(
    @SerialName("primary_gateway") val primaryGateway: String = "esewa",
    @SerialName("esewa") val esewa: GatewayCredentialItem = GatewayCredentialItem(
        enabled = true,
        providerName = "eSewa Mobile Wallet",
        environment = "test",
        callbackUrl = "https://dactor.np/payment/esewa/callback"
    ),
    @SerialName("khalti") val khalti: GatewayCredentialItem = GatewayCredentialItem(
        enabled = false,
        providerName = "Khalti Digital Wallet",
        environment = "live",
        callbackUrl = "https://dactor.np/payment/khalti/callback"
    ),
    @SerialName("fonepay") val fonepay: GatewayCredentialItem = GatewayCredentialItem(
        enabled = false,
        providerName = "Fonepay Dynamic QR",
        environment = "live",
        callbackUrl = "https://dactor.np/payment/fonepay/callback"
    ),
    @SerialName("connectips") val connectips: GatewayCredentialItem = GatewayCredentialItem(
        enabled = false,
        providerName = "ConnectIPS Direct Bank",
        environment = "live",
        callbackUrl = "https://dactor.np/payment/connectips/callback"
    ),
    @SerialName("custom") val custom: GatewayCredentialItem = GatewayCredentialItem(
        enabled = false,
        providerName = "Custom Bank / Merchant API",
        environment = "live",
        callbackUrl = ""
    )
) {
    fun getGateway(id: String): GatewayCredentialItem {
        return when (id.lowercase()) {
            "esewa" -> esewa
            "khalti" -> khalti
            "fonepay" -> fonepay
            "connectips" -> connectips
            "custom" -> custom
            else -> esewa
        }
    }

    fun withGateway(id: String, item: GatewayCredentialItem): PaymentGatewaysConfig {
        return when (id.lowercase()) {
            "esewa" -> copy(esewa = item)
            "khalti" -> copy(khalti = item)
            "fonepay" -> copy(fonepay = item)
            "connectips" -> copy(connectips = item)
            "custom" -> copy(custom = item)
            else -> this
        }
    }

    fun getEnabledGateways(): List<Pair<String, GatewayCredentialItem>> {
        val all = listOf(
            "esewa" to esewa,
            "khalti" to khalti,
            "fonepay" to fonepay,
            "connectips" to connectips,
            "custom" to custom
        )
        val enabledList = all.filter { (_, item) ->
            item.enabled || item.merchantId.isNotBlank() || item.publicKey.isNotBlank() || item.secretKey.isNotBlank()
        }
        return if (enabledList.isNotEmpty()) enabledList else listOf("esewa" to esewa)
    }

    fun toJson(): String = encode(this.copy(esewa = esewa.copy(secretKey = ""), khalti = khalti.copy(secretKey = ""), fonepay = fonepay.copy(secretKey = ""), connectips = connectips.copy(secretKey = ""), custom = custom.copy(secretKey = "")))

    companion object {
        private val json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
        }

        fun parse(
            rawJson: String?,
            fallbackProvider: String? = "esewa",
            fallbackMerchantId: String? = null,
            fallbackApiKey: String? = null,
            fallbackSecretKey: String? = null
        ): PaymentGatewaysConfig {
            val prov = (fallbackProvider ?: "esewa").lowercase()
            if (!rawJson.isNullOrBlank() && rawJson.trim().startsWith("{")) {
                try {
                    val decoded = json.decodeFromString<PaymentGatewaysConfig>(rawJson)
                    // Backfill primary gateway from top-level fields if empty in JSON
                    val currentPrimary = decoded.getGateway(prov)
                    if (currentPrimary.merchantId.isBlank() && currentPrimary.publicKey.isBlank() && currentPrimary.secretKey.isBlank() &&
                        (!fallbackMerchantId.isNullOrBlank() || !fallbackApiKey.isNullOrBlank() || !fallbackSecretKey.isNullOrBlank())
                    ) {
                        return decoded.withGateway(
                            prov,
                            currentPrimary.copy(
                                enabled = true,
                                merchantId = fallbackMerchantId ?: "",
                                publicKey = fallbackApiKey ?: "",
                                secretKey = fallbackSecretKey ?: ""
                            )
                        )
                    }
                    return decoded
                } catch (_: Exception) {}
            }
            val base = PaymentGatewaysConfig(primaryGateway = prov)
            val target = base.getGateway(prov).copy(
                enabled = true,
                merchantId = fallbackMerchantId ?: "",
                publicKey = fallbackApiKey ?: "",
                secretKey = fallbackSecretKey ?: ""
            )
            return base.withGateway(prov, target)
        }

        fun encode(config: PaymentGatewaysConfig): String {
            return json.encodeToString(serializer(), config)
        }
    }
}
