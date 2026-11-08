package com.dactor.patient.domain.util

object PrivacyMasker {
    fun maskName(name: String): String {
        if (name.isBlank()) return name
        val parts = name.split(" ")
        return parts.joinToString(" ") { part ->
            if (part.length <= 2) part
            else part.first() + "*".repeat(part.length - 2) + part.last()
        }
    }

    fun maskPhone(phone: String): String {
        if (phone.length < 6) return phone
        val start = phone.substring(0, 4)
        val end = phone.substring(phone.length - 2)
        val middle = "*".repeat(phone.length - 6)
        return "$start$middle$end"
    }

    fun maskEmail(email: String): String {
        if (!email.contains("@")) return email
        val parts = email.split("@")
        val name = parts[0]
        val domain = parts[1]
        
        val maskedName = if (name.length > 2) "${name.first()}${"*".repeat(name.length - 2)}${name.last()}" else name
        val domainParts = domain.split(".")
        if (domainParts.size < 2) return "$maskedName@$domain"
        
        val ext = domainParts.last()
        val d = domainParts.dropLast(1).joinToString(".")
        val maskedDomain = if (d.length > 2) "${d.first()}${"*".repeat(d.length - 2)}${d.last()}" else d
        
        return "$maskedName@$maskedDomain.$ext"
    }
}
