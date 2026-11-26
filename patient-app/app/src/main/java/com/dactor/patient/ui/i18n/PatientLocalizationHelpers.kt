package com.dactor.patient.ui.i18n

object PatientLocalizationHelpers {

    fun localizedStatus(status: String?, isNepali: Boolean): String {
        return when (status?.trim()?.lowercase()) {
            "waiting" -> if (isNepali) "प्रतीक्षारत" else "Waiting"
            "in_consultation", "in-consultation", "serving" -> if (isNepali) "परामर्श कक्षमा" else "In Consultation"
            "completed", "done" -> if (isNepali) "सम्पन्न" else "Completed"
            "cancelled", "canceled" -> if (isNepali) "रद्द गरिएको" else "Cancelled"
            "no_show", "no-show" -> if (isNepali) "अनुपस्थित (No-Show)" else "No-Show"
            "pending" -> if (isNepali) "प्रतीक्षारत" else "Pending"
            "approved" -> if (isNepali) "स्वीकृत" else "Approved"
            "rejected" -> if (isNepali) "अस्वीकार गरिएको" else "Rejected"
            else -> status.orEmpty()
        }
    }

    fun localizedPaymentStatus(status: String?, isNepali: Boolean): String {
        return when (status?.trim()?.lowercase()) {
            "paid", "completed", "success" -> if (isNepali) "भुक्तान भइसकेको" else "Paid"
            "pending" -> if (isNepali) "भुक्तानी बाँकी" else "Pending"
            "failed" -> if (isNepali) "असफल भयो" else "Failed"
            "refunded" -> if (isNepali) "फिर्ता गरिएको" else "Refunded"
            else -> status.orEmpty()
        }
    }

    fun localizedPaymentMode(mode: String?, isNepali: Boolean): String {
        return when (mode?.trim()?.lowercase()) {
            "cash" -> if (isNepali) "नगद (Cash)" else "Cash at Counter"
            "esewa" -> if (isNepali) "ईसेवा (eSewa)" else "eSewa"
            "khalti" -> if (isNepali) "खल्ती (Khalti)" else "Khalti"
            "card" -> if (isNepali) "कार्ड (Card)" else "Credit / Debit Card"
            "pay_at_desk", "desk" -> if (isNepali) "काउन्टर भुक्तानी (Pay at Desk)" else "Pay at Desk"
            else -> mode.orEmpty()
        }
    }

    fun localizedBookingType(type: String?, isNepali: Boolean): String {
        return when (type?.trim()?.lowercase()) {
            "walkin", "walk_in", "walk-in" -> if (isNepali) "वाक-इन (काउन्टर)" else "Walk-In"
            "online", "app" -> if (isNepali) "अनलाइन एप" else "Online Booking"
            else -> type.orEmpty()
        }
    }

    fun localizedDurationMinutes(minutes: Int, isNepali: Boolean): String {
        return if (isNepali) "~ $minutes मिनेट" else "~ $minutes min"
    }

    fun formatPrice(amount: Double, isNepali: Boolean): String {
        val formatted = if (amount % 1.0 == 0.0) amount.toLong().toString() else "%.2f".format(java.util.Locale.US, amount)
        val prefix = if (isNepali) "रु. " else "Rs. "
        return "$prefix$formatted"
    }
}
