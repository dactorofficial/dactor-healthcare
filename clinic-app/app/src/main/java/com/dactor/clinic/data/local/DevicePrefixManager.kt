package com.dactor.clinic.data.local

import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings
import com.dactor.clinic.domain.util.TrackingCodeGenerator
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages persistent terminal ID and device prefix for offline multi-terminal clinics.
 * Coordinates collision-free human numbering for billing invoices, queue tokens,
 * and structured 10-digit tracking codes with automated daily rollover.
 */
@Singleton
class DevicePrefixManager(
    private val prefs: SharedPreferences,
    defaultTerminalId: Int = 101,
    private val dateProvider: () -> LocalDate = { LocalDate.now() }
) {
    @Inject
    constructor(@ApplicationContext context: Context) : this(
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE),
        defaultTerminalId = deriveDefaultTerminalId(context),
        dateProvider = { LocalDate.now() }
    )

    companion object {
        const val PREFS_NAME = "dactor_device_numbering"
        const val KEY_DEVICE_PREFIX = "device_prefix"
        const val KEY_TERMINAL_ID = "terminal_id"
        const val KEY_LAST_DATE = "last_counter_date"
        const val KEY_BILLING_COUNTER = "billing_counter"
        const val KEY_QUEUE_COUNTER = "queue_counter"
        const val KEY_TRACKING_COUNTER = "tracking_counter"

        private fun deriveDefaultTerminalId(context: Context): Int {
            return try {
                val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
                val hash = kotlin.math.abs(androidId.hashCode())
                100 + (hash % 900)
            } catch (_: Throwable) {
                101
            }
        }
    }

    init {
        ensureInitialized(defaultTerminalId)
    }

    private fun ensureInitialized(defaultTerminalId: Int) {
        if (!prefs.contains(KEY_TERMINAL_ID)) {
            val terminalId = defaultTerminalId.coerceIn(100, 999)
            val prefix = "T" + String.format(java.util.Locale.US, "%02d", terminalId % 100)
            prefs.edit()
                .putInt(KEY_TERMINAL_ID, terminalId)
                .putString(KEY_DEVICE_PREFIX, prefix)
                .apply()
        }
    }

    fun getTerminalId(): Int = prefs.getInt(KEY_TERMINAL_ID, 101)

    fun getDevicePrefix(): String = prefs.getString(KEY_DEVICE_PREFIX, "T01") ?: "T01"

    fun setDevicePrefix(prefix: String, terminalId: Int) {
        require(terminalId in 100..999) { "Terminal ID must be between 100 and 999: $terminalId" }
        val cleanPrefix = prefix.trim().uppercase()
        require(cleanPrefix.isNotBlank()) { "Device prefix cannot be blank" }
        prefs.edit()
            .putString(KEY_DEVICE_PREFIX, cleanPrefix)
            .putInt(KEY_TERMINAL_ID, terminalId)
            .apply()
    }

    @Synchronized
    fun getNextTrackingCode(): String {
        val today = dateProvider()
        rolloverDateIfNeeded(today)

        val currentCounter = prefs.getInt(KEY_TRACKING_COUNTER, 0)
        val nextCounter = if (currentCounter >= 999) 1 else currentCounter + 1
        prefs.edit().putInt(KEY_TRACKING_COUNTER, nextCounter).apply()

        return TrackingCodeGenerator.generate(getTerminalId(), today.dayOfYear, nextCounter)
    }

    @Synchronized
    fun getNextBillingNumber(): String {
        val today = dateProvider()
        rolloverDateIfNeeded(today)

        val currentCounter = prefs.getInt(KEY_BILLING_COUNTER, 0)
        val nextCounter = currentCounter + 1
        prefs.edit().putInt(KEY_BILLING_COUNTER, nextCounter).apply()

        val dateCompact = today.format(DateTimeFormatter.ofPattern("yyyyMMdd"))
        val prefix = getDevicePrefix()
        return "B-$prefix-$dateCompact-${String.format(java.util.Locale.US, "%04d", nextCounter)}"
    }

    @Synchronized
    fun getNextQueueToken(): String {
        val today = dateProvider()
        rolloverDateIfNeeded(today)

        val currentCounter = prefs.getInt(KEY_QUEUE_COUNTER, 0)
        val nextCounter = currentCounter + 1
        prefs.edit().putInt(KEY_QUEUE_COUNTER, nextCounter).apply()

        val prefix = getDevicePrefix()
        return "T-$prefix-${String.format(java.util.Locale.US, "%03d", nextCounter)}"
    }

    fun generateTrackingCode(): String = getNextTrackingCode()
    fun generateBillNumber(): String = getNextBillingNumber()
    fun generateQueueToken(): String = getNextQueueToken()

    private fun rolloverDateIfNeeded(currentDate: LocalDate) {
        val currentDateStr = currentDate.toString()
        val lastDate = prefs.getString(KEY_LAST_DATE, null)
        if (lastDate != currentDateStr) {
            prefs.edit()
                .putString(KEY_LAST_DATE, currentDateStr)
                .putInt(KEY_BILLING_COUNTER, 0)
                .putInt(KEY_QUEUE_COUNTER, 0)
                .putInt(KEY_TRACKING_COUNTER, 0)
                .apply()
        }
    }
}
