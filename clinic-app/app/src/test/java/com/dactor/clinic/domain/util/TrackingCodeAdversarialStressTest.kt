package com.dactor.clinic.domain.util

import android.content.SharedPreferences
import com.dactor.clinic.data.local.DevicePrefixManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.time.LocalDate
import java.util.HashSet
import kotlin.random.Random

/**
 * Adversarial Stress & Empirical Verification Test Suite for Milestone 1:
 * - 0.0000% collision rate across 10,000+ generated tracking codes across arbitrary terminals, days, and counters.
 * - 100.00% detection rate on all single-digit substitutions across test payloads.
 * - Exact mathematical adjacent transposition detection characterization.
 * - DevicePrefixManager billing number format (B-[DEVICE_PREFIX]-[YYYYMMDD]-[0001]) and queue token (T-[DEVICE_PREFIX]-[001]).
 * - Multi-day rollover, counter wrap-around at 999, and large-scale multi-terminal partitioning.
 */
class TrackingCodeAdversarialStressTest {

    // =========================================================================
    // 1. COLLISION FREEDOM STRESS TESTING (10,000+ CODES)
    // =========================================================================

    @Test
    fun testCombinatorialCollisionFreedom_11000Codes() {
        val uniqueCodes = HashSet<String>(15000)
        var totalGenerated = 0

        // 20 terminals (100..119) * 10 days of year (1..10) * 55 counters (1..55) = 11,000 codes
        for (term in 100..119) {
            for (doy in 1..10) {
                for (counter in 1..55) {
                    val code = TrackingCodeGenerator.generate(term, doy, counter)
                    assertEquals("Code must be exactly 10 digits", 10, code.length)
                    assertTrue("Code must pass Luhn verification: $code", TrackingCodeGenerator.isValid(code))

                    val added = uniqueCodes.add(code)
                    assertTrue("Collision detected for code: $code at ($term, $doy, $counter)", added)
                    totalGenerated++
                }
            }
        }

        assertEquals(11000, totalGenerated)
        assertEquals("HashSet size must equal total generated (0.0000% collision)", 11000, uniqueCodes.size)
        val collisionCount = totalGenerated - uniqueCodes.size
        val collisionRate = (collisionCount.toDouble() / totalGenerated.toDouble()) * 100.0
        assertEquals(0.0, collisionRate, 0.000001)
    }

    @Test
    fun testRandomizedCollisionFreedom_15000CodesAcrossFullSpace() {
        val uniqueCodes = HashSet<String>(20000)
        val payloadSet = HashSet<String>(20000)
        val rng = Random(42) // Fixed seed for reproducible empirical verification

        val targetCount = 15000
        var generated = 0

        while (generated < targetCount) {
            val terminal = rng.nextInt(100, 1000)   // 100..999
            val dayOfYear = rng.nextInt(1, 367)     // 1..366
            val counter = rng.nextInt(1, 1000)      // 1..999

            val payloadKey = "$terminal-$dayOfYear-$counter"
            if (!payloadSet.add(payloadKey)) {
                continue // Skip duplicated random inputs to test injectivity of unique inputs
            }

            val code = TrackingCodeGenerator.generate(terminal, dayOfYear, counter)
            assertTrue("Code must be valid: $code", TrackingCodeGenerator.isValid(code))
            assertEquals(terminal, TrackingCodeGenerator.extractTerminalId(code))
            assertEquals(dayOfYear, TrackingCodeGenerator.extractDayOfYear(code))
            assertEquals(counter, TrackingCodeGenerator.extractCounter(code))

            val isUnique = uniqueCodes.add(code)
            assertTrue("Generated code must be unique: $code", isUnique)
            generated++
        }

        assertEquals(targetCount, generated)
        assertEquals(targetCount, uniqueCodes.size)
    }

    // =========================================================================
    // 2. SINGLE-DIGIT SUBSTITUTION TYPO DETECTION (100.00% DETECTION RATE)
    // =========================================================================

    @Test
    fun testSingleDigitSubstitution_100PercentDetectionRate() {
        val testPayloads = mutableListOf<String>()

        // Boundary cases
        testPayloads.add(TrackingCodeGenerator.generate(100, 1, 1))
        testPayloads.add(TrackingCodeGenerator.generate(999, 366, 999))
        testPayloads.add(TrackingCodeGenerator.generate(500, 180, 500))

        // Known vectors
        testPayloads.add(TrackingCodeGenerator.generate(101, 295, 1))
        testPayloads.add(TrackingCodeGenerator.generate(202, 100, 42))
        testPayloads.add(TrackingCodeGenerator.generate(789, 45, 812))

        // Randomly generated codes across the parameter space
        val rng = Random(12345)
        for (i in 1..24) {
            val t = rng.nextInt(100, 1000)
            val d = rng.nextInt(1, 367)
            val c = rng.nextInt(1, 1000)
            testPayloads.add(TrackingCodeGenerator.generate(t, d, c))
        }

        assertEquals(30, testPayloads.size)

        var totalMutationsTested = 0
        var totalDetectedMutations = 0

        for (originalCode in testPayloads) {
            assertTrue("Base code must be valid", TrackingCodeGenerator.isValid(originalCode))

            // For each of the 10 digit positions
            for (pos in 0 until 10) {
                val originalChar = originalCode[pos]

                // Mutate to all other 9 possible digits
                for (replacement in '0'..'9') {
                    if (replacement == originalChar) continue

                    val chars = originalCode.toCharArray()
                    chars[pos] = replacement
                    val mutatedCode = String(chars)

                    totalMutationsTested++

                    val isValid = TrackingCodeGenerator.isValid(mutatedCode)
                    if (!isValid) {
                        totalDetectedMutations++
                    } else {
                        fail("Undetected single-digit mutation! Original: $originalCode, Mutated: $mutatedCode at pos $pos ($originalChar -> $replacement)")
                    }
                }
            }
        }

        // 30 base codes * 10 positions * 9 substitutions = 2,700 mutated codes
        assertEquals(2700, totalMutationsTested)
        assertEquals(2700, totalDetectedMutations)
        val detectionRate = (totalDetectedMutations.toDouble() / totalMutationsTested.toDouble()) * 100.0
        assertEquals("Detection rate must be exactly 100.00%", 100.0, detectionRate, 0.000001)
    }

    // =========================================================================
    // 3. ADJACENT TRANSPOSITION DETECTION CHARACTERIZATION
    // =========================================================================

    @Test
    fun testAdjacentTransposition_detectionProperties() {
        // Mathematical theorem of Luhn mod-10:
        // Transposition of adjacent digits (a, b) is detected whenever |a - b| != 9.
        // Pairs (0, 9) and (9, 0) produce identical sum mod 10 in standard Luhn mod-10.
        val rng = Random(999)
        var testedPairs = 0
        var detectedTranspositions = 0
        var zeroNinePairs = 0

        for (k in 1..50) {
            val code = TrackingCodeGenerator.generate(
                rng.nextInt(100, 1000),
                rng.nextInt(1, 367),
                rng.nextInt(1, 1000)
            )

            for (pos in 0 until 9) {
                val d1 = code[pos]
                val d2 = code[pos + 1]

                if (d1 == d2) continue // Swapping identical digits is not a transposition

                val chars = code.toCharArray()
                chars[pos] = d2
                chars[pos + 1] = d1
                val swapped = String(chars)

                val diff = kotlin.math.abs(d1 - d2)
                testedPairs++

                if (diff == 9) {
                    zeroNinePairs++
                    // Standard Luhn invariant: (0, 9) transpositions yield identical mod-10 checksum
                    assertTrue("0-9 adjacent transposition invariant", (d1 == '0' && d2 == '9') || (d1 == '9' && d2 == '0'))
                } else {
                    val isValid = TrackingCodeGenerator.isValid(swapped)
                    if (!isValid) {
                        detectedTranspositions++
                    } else {
                        fail("Transposition not detected for non-9-diff pair ($d1, $d2) at pos $pos in $code -> $swapped")
                    }
                }
            }
        }

        assertTrue("Must have tested multiple adjacent pairs", testedPairs > 200)
        // For all pairs where |d1 - d2| != 9, detection rate must be 100%
        val nonZeroNinePairs = testedPairs - zeroNinePairs
        assertEquals(nonZeroNinePairs, detectedTranspositions)
        val nonZeroNineDetectionRate = (detectedTranspositions.toDouble() / nonZeroNinePairs.toDouble()) * 100.0
        assertEquals(100.0, nonZeroNineDetectionRate, 0.000001)
    }

    // =========================================================================
    // 4. DEVICE PREFIX MANAGER FORMAT & MULTI-DEVICE STRESS
    // =========================================================================

    @Test
    fun testDevicePrefixManager_billingNumberFormatSpecification() {
        val fakePrefs = FakeSharedPreferences()
        val fixedDate = LocalDate.of(2026, 10, 22)
        val manager = DevicePrefixManager(fakePrefs, defaultTerminalId = 101, dateProvider = { fixedDate })
        manager.setDevicePrefix("T01", 101)

        val bill1 = manager.getNextBillingNumber()
        val bill2 = manager.getNextBillingNumber()
        val bill3 = manager.getNextBillingNumber()

        assertEquals("B-T01-20261022-0001", bill1)
        assertEquals("B-T01-20261022-0002", bill2)
        assertEquals("B-T01-20261022-0003", bill3)

        // Regex verification: B-[DEVICE_PREFIX]-[YYYYMMDD]-[0001]
        val billRegex = Regex("^B-[A-Z0-9]+-\\d{8}-\\d{4}$")
        assertTrue("Bill format must match specification", billRegex.matches(bill1))
        assertTrue("Bill format must match specification", billRegex.matches(bill2))
        assertTrue("Bill format must match specification", billRegex.matches(bill3))
    }

    @Test
    fun testDevicePrefixManager_queueTokenFormatSpecification() {
        val fakePrefs = FakeSharedPreferences()
        val fixedDate = LocalDate.of(2026, 10, 22)
        val manager = DevicePrefixManager(fakePrefs, defaultTerminalId = 101, dateProvider = { fixedDate })
        manager.setDevicePrefix("T01", 101)

        val token1 = manager.getNextQueueToken()
        val token2 = manager.getNextQueueToken()
        val token3 = manager.getNextQueueToken()

        assertEquals("T-T01-001", token1)
        assertEquals("T-T01-002", token2)
        assertEquals("T-T01-003", token3)

        // Regex verification: T-[DEVICE_PREFIX]-[001]
        val tokenRegex = Regex("^T-[A-Z0-9]+-\\d{3}$")
        assertTrue("Token format must match specification", tokenRegex.matches(token1))
        assertTrue("Token format must match specification", tokenRegex.matches(token2))
        assertTrue("Token format must match specification", tokenRegex.matches(token3))
    }

    @Test
    fun testDevicePrefixManager_dailyRolloverAcrossMultipleDays() {
        val fakePrefs = FakeSharedPreferences()
        var currentDate = LocalDate.of(2026, 10, 22)
        val manager = DevicePrefixManager(fakePrefs, defaultTerminalId = 205, dateProvider = { currentDate })
        manager.setDevicePrefix("REG1", 205)

        // Day 1
        assertEquals("B-REG1-20261022-0001", manager.getNextBillingNumber())
        assertEquals("B-REG1-20261022-0002", manager.getNextBillingNumber())
        assertEquals("T-REG1-001", manager.getNextQueueToken())
        assertEquals("T-REG1-002", manager.getNextQueueToken())

        // Day 2 (Rollover)
        currentDate = LocalDate.of(2026, 10, 23)
        assertEquals("B-REG1-20261023-0001", manager.getNextBillingNumber())
        assertEquals("T-REG1-001", manager.getNextQueueToken())

        // Day 3 (Rollover)
        currentDate = LocalDate.of(2026, 10, 24)
        assertEquals("B-REG1-20261024-0001", manager.getNextBillingNumber())
        assertEquals("T-REG1-001", manager.getNextQueueToken())
    }

    @Test
    fun testDevicePrefixManager_trackingCounterWraparoundAt999() {
        val fakePrefs = FakeSharedPreferences()
        val fixedDate = LocalDate.of(2026, 10, 22)
        val manager = DevicePrefixManager(fakePrefs, defaultTerminalId = 101, dateProvider = { fixedDate })

        // Pre-load counter to 998
        fakePrefs.edit()
            .putString(DevicePrefixManager.KEY_LAST_DATE, fixedDate.toString())
            .putInt(DevicePrefixManager.KEY_TRACKING_COUNTER, 998)
            .apply()

        // 999th code
        val code999 = manager.getNextTrackingCode()
        assertEquals(999, TrackingCodeGenerator.extractCounter(code999))
        assertTrue(TrackingCodeGenerator.isValid(code999))

        // 1000th code -> counter should wrap around to 1 without throwing exception
        val codeWrapped = manager.getNextTrackingCode()
        assertEquals(1, TrackingCodeGenerator.extractCounter(codeWrapped))
        assertTrue(TrackingCodeGenerator.isValid(codeWrapped))
    }

    @Test
    fun testDevicePrefixManager_multiTerminalLargeScaleIsolation() {
        val terminals = (1..5).map { id ->
            val prefs = FakeSharedPreferences()
            val terminalId = 100 + id
            val prefix = "T%02d".format(id)
            val mgr = DevicePrefixManager(prefs, defaultTerminalId = terminalId, dateProvider = { LocalDate.of(2026, 10, 22) })
            mgr.setDevicePrefix(prefix, terminalId)
            mgr
        }

        val allBills = HashSet<String>()
        val allTokens = HashSet<String>()
        val allTracking = HashSet<String>()

        val countPerTerminal = 500 // 5 terminals * 500 = 2,500 operations each
        for (mgr in terminals) {
            for (i in 1..countPerTerminal) {
                val bill = mgr.getNextBillingNumber()
                val token = mgr.getNextQueueToken()
                val tracking = mgr.getNextTrackingCode()

                assertTrue("Billing collision across terminals: $bill", allBills.add(bill))
                assertTrue("Token collision across terminals: $token", allTokens.add(token))
                assertTrue("Tracking collision across terminals: $tracking", allTracking.add(tracking))
            }
        }

        assertEquals(2500, allBills.size)
        assertEquals(2500, allTokens.size)
        assertEquals(2500, allTracking.size)
    }

    @Test
    fun testEdgeCases_leapYearAndMalformed() {
        // Day 366 (leap year valid)
        val leapCode = TrackingCodeGenerator.generate(101, 366, 1)
        assertTrue(TrackingCodeGenerator.isValid(leapCode))
        assertEquals(366, TrackingCodeGenerator.extractDayOfYear(leapCode))

        // Day 367 (invalid)
        try {
            TrackingCodeGenerator.generate(101, 367, 1)
            fail("Day 367 must throw IllegalArgumentException")
        } catch (_: IllegalArgumentException) {}

        // Invalid lengths and non-digits
        assertFalse(TrackingCodeGenerator.isValid("101295001"))
        assertFalse(TrackingCodeGenerator.isValid("10129500188"))
        assertFalse(TrackingCodeGenerator.isValid("101295001A"))
        assertFalse(TrackingCodeGenerator.isValid("ABCDEFGHIJ"))
    }

    // =========================================================================
    // In-Memory Fake SharedPreferences for Unit Testing
    // =========================================================================

    private class FakeSharedPreferences : SharedPreferences {
        private val data = HashMap<String, Any?>()

        override fun getAll(): MutableMap<String, *> = HashMap(data)
        override fun getString(key: String?, defValue: String?): String? = (data[key] as? String) ?: defValue
        override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
            @Suppress("UNCHECKED_CAST") (data[key] as? MutableSet<String>) ?: defValues
        override fun getInt(key: String?, defValue: Int): Int = (data[key] as? Int) ?: defValue
        override fun getLong(key: String?, defValue: Long): Long = (data[key] as? Long) ?: defValue
        override fun getFloat(key: String?, defValue: Float): Float = (data[key] as? Float) ?: defValue
        override fun getBoolean(key: String?, defValue: Boolean): Boolean = (data[key] as? Boolean) ?: defValue
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
