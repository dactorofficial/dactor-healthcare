package com.dactor.patient.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class PublicPaymentMethod(
    @SerialName("id") val id: String = "",
    @SerialName("name") val name: String = "",
    @SerialName("subtitle") val subtitle: String = "",
    @SerialName("environment") val environment: String = "live",
    @SerialName("merchant_display_id") val merchantDisplayId: String = "",
    @SerialName("is_verified") val isVerified: Boolean = false,
    @SerialName("requires_keys") val requiresKeys: Boolean = true,
    @SerialName("requires_desk_approval") val requiresDeskApproval: Boolean = false
)

@Serializable
data class GatewayCredentialItem(
    @SerialName("enabled") val enabled: Boolean = false,
    @SerialName("provider_name") val providerName: String = "",
    @SerialName("environment") val environment: String = "test", // "live" or "test"
    @SerialName("merchant_id") val merchantId: String = "",
    @SerialName("public_key") val publicKey: String = "",
    @SerialName("secret_key") val secretKey: String = "",
    @SerialName("account_number") val accountNumber: String = "",
    @SerialName("callback_url") val callbackUrl: String = "",
    @SerialName("is_verified") val isVerified: Boolean = false,
    @SerialName("verified_at") val verifiedAt: String? = null
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
        environment = "test",
        callbackUrl = "https://dactor.np/payment/khalti/callback"
    ),
    @SerialName("fonepay") val fonepay: GatewayCredentialItem = GatewayCredentialItem(
        enabled = false,
        providerName = "Fonepay Dynamic QR",
        environment = "test",
        callbackUrl = "https://dactor.np/payment/fonepay/callback"
    ),
    @SerialName("connectips") val connectips: GatewayCredentialItem = GatewayCredentialItem(
        enabled = false,
        providerName = "ConnectIPS Direct Bank",
        environment = "test",
        callbackUrl = "https://dactor.np/payment/connectips/callback"
    ),
    @SerialName("custom") val custom: GatewayCredentialItem = GatewayCredentialItem(
        enabled = false,
        providerName = "Custom Bank / Merchant API",
        environment = "test",
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

    fun getVerifiedGateways(): List<Pair<String, GatewayCredentialItem>> {
        val all = listOf(
            "esewa" to esewa,
            "khalti" to khalti,
            "fonepay" to fonepay,
            "connectips" to connectips
        )
        return all.filter { (_, item) ->
            item.enabled && item.isVerified && (item.merchantId.isNotBlank() || item.publicKey.isNotBlank())
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
