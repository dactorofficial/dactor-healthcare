package com.dactor.clinic.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class InvoiceItem(
    @SerialName("item_name") val rawItemName: String? = null,
    @SerialName("itemName") val camelItemName: String? = null,
    @SerialName("name") val plainName: String? = null,
    @SerialName("quantity") val quantity: Int = 1,
    @SerialName("price") val price: Double = 0.0,
    @SerialName("total") val total: Double = 0.0
) {
    constructor(
        itemName: String,
        quantity: Int = 1,
        price: Double = 0.0,
        total: Double = 0.0
    ) : this(
        rawItemName = itemName,
        camelItemName = itemName,
        plainName = itemName,
        quantity = quantity,
        price = price,
        total = if (total > 0.0) total else price * quantity
    )

    val itemName: String
        get() = rawItemName?.takeIf { it.isNotBlank() }
            ?: camelItemName?.takeIf { it.isNotBlank() }
            ?: plainName?.takeIf { it.isNotBlank() }
            ?: "Clinical Service"

    val effectiveTotal: Double
        get() = if (total > 0.0) total else price * quantity
}
