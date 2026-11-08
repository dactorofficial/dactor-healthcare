package com.dactor.clinic.data.local

import android.content.SharedPreferences
import com.dactor.clinic.domain.util.TrackingCodeGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

/**
 * Requirements-driven unit test suite for DevicePrefixManager.
 *
 * Verifies:
 * - Tier 1: Terminal ID & Prefix Persistence and Defaults
 * - Tier 2: Number Formatting for Billing (B-PREFIX-YYYYMMDD-0001) & Queue Tokens (T-PREFIX-001)
 * - Tier 3: Sequential Counter Increments & Daily Calendar Rollover
 * - Tier 4: Multi-Terminal Collision Freedom across devices
 */
class DevicePrefixManagerTest {

    private lateinit var fakePrefs: FakeSharedPreferences
    private var simulatedDate: LocalDate = LocalDate.of(2026, 10, 22)

    @Before
    fun setUp() {
        fakePrefs = FakeSharedPreferences()
        simulatedDate = LocalDate.of(2026, 10, 22)
    }

    private fun createManager(defaultTerminalId: Int = 101): DevicePrefixManager {
        return DevicePrefixManager(
            prefs = fakePrefs,
            defaultTerminalId = defaultTerminalId,
            dateProvider = { simulatedDate }
        )
    }

    // =========================================================================
    // Tier 1: Terminal ID & Prefix Persistence and Defaults
    // =========================================================================

    @Test
    fun testDefaultInitialization_fromTerminalId() {
        val manager = createManager(defaultTerminalId = 105)
        assertEquals(105, manager.getTerminalId())
        assertEquals("T05", manager.getDevicePrefix())
    }

    @Test
    fun testCustomPrefixAndTerminalId_persistence() {
        val manager = createManager(defaultTerminalId = 101)
        manager.setDevicePrefix("CAB1", 205)

        assertEquals("CAB1", manager.getDevicePrefix())
        assertEquals(205, manager.getTerminalId())

        // Verify another manager reading the same prefs sees the persisted values
        val manager2 = createManager()
        assertEquals("CAB1", manager2.getDevicePrefix())
        assertEquals(205, manager2.getTerminalId())
    }

    @Test
    fun testInvalidTerminalIdOrPrefix_rejected() {
        val manager = createManager()

        try {
            manager.setDevicePrefix("T01", 99)
            fail("Terminal ID 99 must fail")
        } catch (_: IllegalArgumentException) {}

        try {
            manager.setDevicePrefix("T01", 1000)
            fail("Terminal ID 1000 must fail")
        } catch (_: IllegalArgumentException) {}

        try {
            manager.setDevicePrefix("   ", 101)
            fail("Blank prefix must fail")
        } catch (_: IllegalArgumentException) {}
    }

    // =========================================================================
    // Tier 2: Number Formatting
    // =========================================================================

    @Test
    fun testBillingNumber_formatting() {
        val manager = createManager(defaultTerminalId = 101)
        manager.setDevicePrefix("T01", 101)

        val bill1 = manager.getNextBillingNumber()
        assertEquals("B-T01-20261022-0001", bill1)

        val bill2 = manager.getNextBillingNumber()
        assertEquals("B-T01-20261022-0002", bill2)
    }

    @Test
    fun testQueueToken_formatting() {
        val manager = createManager(defaultTerminalId = 101)
        manager.setDevicePrefix("T01", 101)

        val token1 = manager.getNextQueueToken()
        assertEquals("T-T01-001", token1)

        val token2 = manager.getNextQueueToken()
        assertEquals("T-T01-002", token2)
    }

    @Test
    fun testTrackingCode_generatesValid10DigitCode() {
        val manager = createManager(defaultTerminalId = 101)
        val trackingCode = manager.getNextTrackingCode()

        assertEquals(10, trackingCode.length)
        assertTrue("Tracking code must satisfy Luhn check", TrackingCodeGenerator.isValid(trackingCode))
        assertEquals(101, TrackingCodeGenerator.extractTerminalId(trackingCode))
        assertEquals(simulatedDate.dayOfYear, TrackingCodeGenerator.extractDayOfYear(trackingCode))
        assertEquals(1, TrackingCodeGenerator.extractCounter(trackingCode))
    }

    // =========================================================================
    // Tier 3: Sequential Counter Increments & Daily Calendar Rollover
    // =========================================================================

    @Test
    fun testDailyRollover_resetsAllCountersToZero() {
        val manager = createManager(defaultTerminalId = 101)
        manager.setDevicePrefix("R01", 101)

        // Generate on Day 1 (2026-10-22)
        assertEquals("B-R01-20261022-0001", manager.getNextBillingNumber())
        assertEquals("B-R01-20261022-0002", manager.getNextBillingNumber())
        assertEquals("T-R01-001", manager.getNextQueueToken())
        assertEquals("T-R01-002", manager.getNextQueueToken())
        val track1 = manager.getNextTrackingCode()
        val track2 = manager.getNextTrackingCode()
        assertEquals(1, TrackingCodeGenerator.extractCounter(track1))
        assertEquals(2, TrackingCodeGenerator.extractCounter(track2))

        // Advance simulated date to Day 2 (2026-10-23)
        simulatedDate = LocalDate.of(2026, 10, 23)

        // All counters must rollover back to 1 with new date stamp
        val billNextDay = manager.getNextBillingNumber()
        assertEquals("B-R01-20261023-0001", billNextDay)

        val tokenNextDay = manager.getNextQueueToken()
        assertEquals("T-R01-001", tokenNextDay)

        val trackNextDay = manager.getNextTrackingCode()
        assertEquals(1, TrackingCodeGenerator.extractCounter(trackNextDay))
        assertEquals(simulatedDate.dayOfYear, TrackingCodeGenerator.extractDayOfYear(trackNextDay))
    }

    // =========================================================================
    // Tier 4: Multi-Terminal Partitioning (Zero Collision)
    // =========================================================================

    @Test
    fun testMultiTerminal_zeroCollision() {
        val prefs1 = FakeSharedPreferences()
        val prefs2 = FakeSharedPreferences()

        val terminal1 = DevicePrefixManager(prefs1, defaultTerminalId = 101, dateProvider = { simulatedDate })
        terminal1.setDevicePrefix("T01", 101)

        val terminal2 = DevicePrefixManager(prefs2, defaultTerminalId = 102, dateProvider = { simulatedDate })
        terminal2.setDevicePrefix("T02", 102)

        val t1Bills = (1..50).map { terminal1.getNextBillingNumber() }
        val t2Bills = (1..50).map { terminal2.getNextBillingNumber() }

        val commonBills = t1Bills.intersect(t2Bills.toSet())
        assertTrue("Billing numbers between distinct terminals must never collide", commonBills.isEmpty())

        val t1Tokens = (1..50).map { terminal1.getNextQueueToken() }
        val t2Tokens = (1..50).map { terminal2.getNextQueueToken() }

        val commonTokens = t1Tokens.intersect(t2Tokens.toSet())
        assertTrue("Queue tokens between distinct terminals must never collide", commonTokens.isEmpty())

        val t1Tracking = (1..50).map { terminal1.getNextTrackingCode() }
        val t2Tracking = (1..50).map { terminal2.getNextTrackingCode() }

        val commonTracking = t1Tracking.intersect(t2Tracking.toSet())
        assertTrue("Tracking codes between distinct terminals must never collide", commonTracking.isEmpty())
    }

    // =========================================================================
    // In-Memory Fake SharedPreferences for Pure JVM Unit Testing
    // =========================================================================

    private class FakeSharedPreferences : SharedPreferences {
        private val data = HashMap<String, Any?>()

        override fun getAll(): MutableMap<String, *> = HashMap(data)

        override fun getString(key: String?, defValue: String?): String? =
            (data[key] as? String) ?: defValue

        override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
            @Suppress("UNCHECKED_CAST") (data[key] as? MutableSet<String>) ?: defValues

        override fun getInt(key: String?, defValue: Int): Int =
            (data[key] as? Int) ?: defValue

        override fun getLong(key: String?, defValue: Long): Long =
            (data[key] as? Long) ?: defValue

        override fun getFloat(key: String?, defValue: Float): Float =
            (data[key] as? Float) ?: defValue

        override fun getBoolean(key: String?, defValue: Boolean): Boolean =
            (data[key] as? Boolean) ?: defValue

        override fun contains(key: String?): Boolean = data.containsKey(key)

        override fun edit(): SharedPreferences.Editor = FakeEditor(data)

        override fun registerOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}

        override fun unregisterOnSharedPreferenceChangeListener(listener: SharedPreferences.OnSharedPreferenceChangeListener?) {}

        private class FakeEditor(private val backingData: HashMap<String, Any?>) : SharedPreferences.Editor {
            private val temp = HashMap<String, Any?>()
            private val removed = HashSet<String>()
            private var clearAll = false

            override fun putString(key: String?, value: String?): SharedPreferences.Editor {
                if (key != null) temp[key] = value
                return this
            }

            override fun putStringSet(key: String?, values: MutableSet<String>?): SharedPreferences.Editor {
                if (key != null) temp[key] = values
                return this
            }

            override fun putInt(key: String?, value: Int): SharedPreferences.Editor {
                if (key != null) temp[key] = value
                return this
            }

            override fun putLong(key: String?, value: Long): SharedPreferences.Editor {
                if (key != null) temp[key] = value
                return this
            }

            override fun putFloat(key: String?, value: Float): SharedPreferences.Editor {
                if (key != null) temp[key] = value
                return this
            }

            override fun putBoolean(key: String?, value: Boolean): SharedPreferences.Editor {
                if (key != null) temp[key] = value
                return this
            }

            override fun remove(key: String?): SharedPreferences.Editor {
                if (key != null) removed.add(key)
                return this
            }

            override fun clear(): SharedPreferences.Editor {
                clearAll = true
                return this
            }

            override fun commit(): Boolean {
                apply()
                return true
            }

            override fun apply() {
                if (clearAll) backingData.clear()
                removed.forEach { backingData.remove(it) }
                backingData.putAll(temp)
            }
        }
    }
}
