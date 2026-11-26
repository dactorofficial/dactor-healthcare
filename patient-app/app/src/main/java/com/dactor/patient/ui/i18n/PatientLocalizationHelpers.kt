package com.dactor.patient.ui.i18n

import java.time.DayOfWeek
import java.util.Locale

object PatientLocalizationHelpers {

    fun localizeAppointmentStatus(status: String?, checkinStatus: String?, lang: AppLanguage): String {
        val s = (status ?: "").trim().lowercase(Locale.ROOT)
        val c = (checkinStatus ?: "").trim().lowercase(Locale.ROOT)

        if (lang == AppLanguage.ENGLISH) {
            return when {
                c == "completed" || c == "done" -> "Completed"
                c == "in_consultation" || c == "with_doctor" -> "With Doctor"
                c == "waiting" || c == "checked_in" -> "In Live Queue"
                s == "cancelled" || c == "cancelled" -> "Cancelled"
                c == "no_show" -> "No-Show"
                s == "approved" -> "Confirmed"
                s == "pending_payment" -> "Payment Pending"
                s == "waiting_for_approval" || s == "unapproved" -> "Pending Approval"
                else -> status?.replace("_", " ")?.replaceFirstChar { it.uppercase() } ?: "Scheduled"
            }
        }

        return when {
            c == "completed" || c == "done" -> "सम्पन्न"
            c == "in_consultation" || c == "with_doctor" -> "डाक्टरसँग परामर्शमा"
            c == "waiting" || c == "checked_in" -> "प्रत्यक्ष लाममा (प्रतीक्षारत)"
            s == "cancelled" || c == "cancelled" -> "रद्द गरिएको"
            c == "no_show" -> "उपस्थित नभएको"
            s == "approved" -> "स्वीकृत (निश्चित)"
            s == "pending_payment" -> "भुक्तानी बाँकी"
            s == "waiting_for_approval" || s == "unapproved" -> "स्वीकृतिको पर्खाइमा"
            else -> "तालिकाबद्ध"
        }
    }

    fun localizePaymentMode(mode: String?, lang: AppLanguage): String {
        val m = (mode ?: "").trim().uppercase(Locale.ROOT)
        if (lang == AppLanguage.ENGLISH) {
            return when (m) {
                "PAY_AT_DESK", "CASH" -> "Pay at Desk"
                "FREE" -> "Free / Follow-Up"
                "ONLINE", "ESEWA", "KHALTI", "CONNECTIPS", "FONEPAY", "IMEPAY" -> if (m == "ONLINE") "Paid Online" else m
                else -> mode ?: "Pay at Desk"
            }
        }

        return when (m) {
            "PAY_AT_DESK", "CASH" -> "काउन्टरमा भुक्तानी"
            "FREE" -> "निःशुल्क (फलो-अप)"
            "ONLINE" -> "अनलाइन भुक्तानी सम्पन्न"
            "ESEWA" -> "ईसेवा (eSewa)"
            "KHALTI" -> "खल्ती (Khalti)"
            "CONNECTIPS" -> "कनेक्टआईपीएस (ConnectIPS)"
            "FONEPAY" -> "फोनपे (Fonepay)"
            "IMEPAY" -> "आइएमई पे (IME Pay)"
            else -> mode ?: "काउन्टरमा भुक्तानी"
        }
    }

    fun localizeGender(gender: String?, lang: AppLanguage): String {
        val g = (gender ?: "").trim().lowercase(Locale.ROOT)
        if (lang == AppLanguage.ENGLISH) {
            return when (g) {
                "male" -> "Male"
                "female" -> "Female"
                "other" -> "Other"
                else -> gender ?: "Not specified"
            }
        }
        return when (g) {
            "male" -> "पुरुष"
            "female" -> "महिला"
            "other" -> "अन्य"
            else -> gender ?: "उल्लेख नगरिएको"
        }
    }

    fun localizeSpecialtyLabel(raw: String, lang: AppLanguage): String {
        if (lang == AppLanguage.ENGLISH) return raw
        val lower = raw.trim().lowercase(Locale.ROOT)
        return when {
            lower.contains("skin") || lower.contains("derma") -> "छाला तथा यौन रोग"
            lower.contains("heart") || lower.contains("cardio") -> "मुटु रोग (कार्डियोलोजी)"
            lower.contains("bone") || lower.contains("ortho") -> "हाडजोर्नी तथा नशा रोग"
            lower.contains("eye") || lower.contains("ophthal") -> "आँखा रोग"
            lower.contains("child") || lower.contains("pedia") -> "बाल रोग (पेडियाट्रिक्स)"
            lower.contains("dent") -> "दाँत तथा मुख स्वास्थ्य"
            lower.contains("general medicine") || lower.contains("physician") -> "सामान्य चिकित्सा (फिजिसियन)"
            lower.contains("ent") || lower.contains("ear") -> "नाक, कान, घाँटी (ENT)"
            lower.contains("neuro") -> "न्युरोलोजी / मस्तिष्क रोग"
            lower.contains("gynae") || lower.contains("obs") || lower.contains("women") -> "स्त्री तथा प्रसूति रोग"
            lower.contains("lab") || lower.contains("patholog") -> "प्याथोलोजी / ल्याब"
            lower.contains("mri") -> "एमआरआई (MRI) स्क्यान"
            lower.contains("ct") -> "सीटी (CT) स्क्यान"
            lower.contains("ultrasound") || lower.contains("usg") || lower.contains("x-ray") -> "अल्ट्रासाउन्ड / एक्सरे"
            else -> raw
        }
    }

    fun localizeWeekdayShort(dayOfWeek: DayOfWeek, lang: AppLanguage): String {
        if (lang == AppLanguage.ENGLISH) {
            return when (dayOfWeek) {
                DayOfWeek.SUNDAY -> "Sun"
                DayOfWeek.MONDAY -> "Mon"
                DayOfWeek.TUESDAY -> "Tue"
                DayOfWeek.WEDNESDAY -> "Wed"
                DayOfWeek.THURSDAY -> "Thu"
                DayOfWeek.FRIDAY -> "Fri"
                DayOfWeek.SATURDAY -> "Sat"
            }
        }
        return when (dayOfWeek) {
            DayOfWeek.SUNDAY -> "आइत"
            DayOfWeek.MONDAY -> "सोम"
            DayOfWeek.TUESDAY -> "मंगल"
            DayOfWeek.WEDNESDAY -> "बुध"
            DayOfWeek.THURSDAY -> "बिही"
            DayOfWeek.FRIDAY -> "शुक्र"
            DayOfWeek.SATURDAY -> "शनि"
        }
    }

    fun localizeCity(city: String?, lang: AppLanguage): String {
        if (city.isNullOrBlank() || lang == AppLanguage.ENGLISH) return city ?: "Nepal"
        val c = city.trim().lowercase(Locale.ROOT)
        return when {
            c == "all nepal" -> "सबै नेपाल"
            c.contains("kathmandu") -> "काठमाडौं"
            c.contains("lalitpur") -> "ललितपुर"
            c.contains("bhaktapur") -> "भक्तपुर"
            c.contains("pokhara") -> "पोखरा"
            c.contains("janakpur") -> "जनकपुर"
            c.contains("biratnagar") -> "विराटनगर"
            c.contains("birgunj") -> "वीरगञ्ज"
            c.contains("dharan") -> "धरान"
            c.contains("chitwan") || c.contains("bharatpur") -> "चितवन"
            c.contains("butwal") -> "बुटवल"
            c.contains("nepalgunj") -> "नेपालगञ्ज"
            c.contains("hetauda") -> "हेटौंडा"
            c.contains("dhangadhi") -> "धनगढी"
            else -> city
        }
    }
}
