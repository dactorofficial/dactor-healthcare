package com.dactor.patient.domain.util

object TrackingCodeGenerator {
    fun generate(): String {
        val firstDigit = (1..9).random()
        val rest = (1..9).map { (0..9).random() }.joinToString("")
        return "$firstDigit$rest"
    }
}
