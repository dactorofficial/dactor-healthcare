package com.dactor.clinic.domain.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Requirements-driven unit test suite for structured 10-digit TrackingCodeGenerator.
 *
 * Verifies:
 * - Tier 1: Core Generation & Luhn Checksum Correctness
 * - Tier 2: 100% Single-Digit Typo Detection & Adjacent Transposition Detection
 * - Tier 3: Boundary Validations, Invalid Formats & Malformed Inputs
 * - Tier 4: Collision Freedom across 1,000+ generated codes
 */
class TrackingCodeGeneratorTest {

    // =========================================================================
    // Tier 1: Core Generation & Luhn Checksum Correctness
    // =========================================================================

    @Test
    fun testGenerateStructuredCode_knownVector() {
        // Known payload: Terminal 101, DOY 295, Counter 001 -> "101295001"
        val payload = "101295001"
        val checksum = TrackingCodeGenerator.calculateLuhnChecksum(payload)
        assertEquals("Check digit for 101295001 must be 8", 8, checksum)

        val code = TrackingCodeGenerator.generate(101, 295, 1)
        assertEquals("1012950018", code)
        assertEquals(10, code.length)
        assertTrue("Generated code must pass Luhn validation", TrackingCodeGenerator.isValid(code))
    }

    @Test
    fun testFieldExtraction_validCode() {
        val code = TrackingCodeGenerator.generate(543, 180, 42)
        assertEquals(10, code.length)
        assertTrue(TrackingCodeGenerator.isValid(code))

        assertEquals(543, TrackingCodeGenerator.extractTerminalId(code))
        assertEquals(180, TrackingCodeGenerator.extractDayOfYear(code))
        assertEquals(42, TrackingCodeGenerator.extractCounter(code))
    }

    @Test
    fun testBoundaryValues_generation() {
        // Minimum valid inputs: Terminal 100, DOY 1, Counter 1
        val minCode = TrackingCodeGenerator.generate(100, 1, 1)
        assertEquals(10, minCode.length)
        assertTrue(TrackingCodeGenerator.isValid(minCode))
        assertEquals(100, TrackingCodeGenerator.extractTerminalId(minCode))
        assertEquals(1, TrackingCodeGenerator.extractDayOfYear(minCode))
        assertEquals(1, TrackingCodeGenerator.extractCounter(minCode))

        // Maximum valid inputs: Terminal 999, DOY 366, Counter 999
        val maxCode = TrackingCodeGenerator.generate(999, 366, 999)
        assertEquals(10, maxCode.length)
        assertTrue(TrackingCodeGenerator.isValid(maxCode))
        assertEquals(999, TrackingCodeGenerator.extractTerminalId(maxCode))
        assertEquals(366, TrackingCodeGenerator.extractDayOfYear(maxCode))
        assertEquals(999, TrackingCodeGenerator.extractCounter(maxCode))
    }

    @Test
    fun testBackwardCompatible_generateOverloads() {
        // 2-argument overload (terminalId, counter)
        val codeWithDoy = TrackingCodeGenerator.generate(200, 15)
        assertEquals(10, codeWithDoy.length)
        assertTrue(TrackingCodeGenerator.isValid(codeWithDoy))
        assertEquals(200, TrackingCodeGenerator.extractTerminalId(codeWithDoy))
        assertEquals(15, TrackingCodeGenerator.extractCounter(codeWithDoy))

        // No-arg generate()
        val legacyCode1 = TrackingCodeGenerator.generate()
        assertEquals(10, legacyCode1.length)
        assertTrue("Legacy generate() must produce valid Luhn code", TrackingCodeGenerator.isValid(legacyCode1))

        // generate10DigitCode()
        val legacyCode2 = TrackingCodeGenerator.generate10DigitCode()
        assertEquals(10, legacyCode2.length)
        assertTrue("generate10DigitCode() must produce valid Luhn code", TrackingCodeGenerator.isValid(legacyCode2))
    }

    // =========================================================================
    // Tier 2: Typo Detection (Single-Digit Modifications & Transpositions)
    // =========================================================================

    @Test
    fun testSingleDigitMutation_detected100Percent() {
        val testCodes = listOf(
            TrackingCodeGenerator.generate(101, 295, 1),
            TrackingCodeGenerator.generate(100, 1, 1),
            TrackingCodeGenerator.generate(999, 366, 999),
            TrackingCodeGenerator.generate(350, 150, 75),
            TrackingCodeGenerator.generate(789, 45, 812)
        )

        for (original in testCodes) {
            assertTrue("Base code must be valid", TrackingCodeGenerator.isValid(original))

            // Test mutating each of the 10 positions to all other 9 possible digits
            for (pos in 0 until 10) {
                val originalChar = original[pos]
                for (replacement in '0'..'9') {
                    if (replacement == originalChar) continue

                    val chars = original.toCharArray()
                    chars[pos] = replacement
                    val mutated = String(chars)

                    assertFalse(
                        "Mutating digit at position $pos from $originalChar to $replacement must be detected: $mutated",
                        TrackingCodeGenerator.isValid(mutated)
                    )
                }
            }
        }
    }

    @Test
    fun testAdjacentTransposition_detected() {
        // Known cases where adjacent digits differ and abs diff != 9
        val baseCode = TrackingCodeGenerator.generate(101, 295, 1) // "1012950018"
        val chars = baseCode.toCharArray()

        // Transpose index 4 ('9') and index 5 ('5')
        chars[4] = '5'
        chars[5] = '9'
        val transposed = String(chars)

        assertFalse("Adjacent transposition of '95' to '59' must be detected", TrackingCodeGenerator.isValid(transposed))
    }

    // =========================================================================
    // Tier 3: Boundaries, Range Validation & Malformed Inputs
    // =========================================================================

    @Test
    fun testInvalidRanges_throwIllegalArgumentException() {
        // Invalid Terminal IDs (< 100 or > 999)
        try {
            TrackingCodeGenerator.generate(99, 100, 1)
            fail("Terminal ID 99 must fail")
        } catch (_: IllegalArgumentException) {}

        try {
            TrackingCodeGenerator.generate(1000, 100, 1)
            fail("Terminal ID 1000 must fail")
        } catch (_: IllegalArgumentException) {}

        // Invalid Day of Year (< 1 or > 366)
        try {
            TrackingCodeGenerator.generate(101, 0, 1)
            fail("Day of Year 0 must fail")
        } catch (_: IllegalArgumentException) {}

        try {
            TrackingCodeGenerator.generate(101, 367, 1)
            fail("Day of Year 367 must fail")
        } catch (_: IllegalArgumentException) {}

        // Invalid Counter (< 1 or > 999)
        try {
            TrackingCodeGenerator.generate(101, 100, 0)
            fail("Counter 0 must fail")
        } catch (_: IllegalArgumentException) {}

        try {
            TrackingCodeGenerator.generate(101, 100, 1000)
            fail("Counter 1000 must fail")
        } catch (_: IllegalArgumentException) {}
    }

    @Test
    fun testMalformedCodes_rejectedByIsValid() {
        assertFalse("Empty string is invalid", TrackingCodeGenerator.isValid(""))
        assertFalse("Too short (9 digits)", TrackingCodeGenerator.isValid("101295001"))
        assertFalse("Too long (11 digits)", TrackingCodeGenerator.isValid("10129500180"))
        assertFalse("Contains alphabetic letters", TrackingCodeGenerator.isValid("101295001A"))
        assertFalse("Contains special chars", TrackingCodeGenerator.isValid("101295-018"))
        assertFalse("Contains spaces", TrackingCodeGenerator.isValid("101 950018"))
    }

    @Test
    fun testExtractors_returnNullForInvalidCode() {
        assertNull(TrackingCodeGenerator.extractTerminalId("invalid123"))
        assertNull(TrackingCodeGenerator.extractDayOfYear("invalid123"))
        assertNull(TrackingCodeGenerator.extractCounter("invalid123"))

        // Corrupted code with invalid checksum
        val corrupted = "1012950019" // Checksum should be 8
        assertNull(TrackingCodeGenerator.extractTerminalId(corrupted))
        assertNull(TrackingCodeGenerator.extractDayOfYear(corrupted))
        assertNull(TrackingCodeGenerator.extractCounter(corrupted))
    }

    // =========================================================================
    // Tier 4: Collision-Freedom Across Multi-Terminal & Multi-Day Generation
    // =========================================================================

    @Test
    fun testCollisionFreedom_acrossMultiTerminalAndCounters() {
        val generatedCodes = HashSet<String>()
        val totalExpected = 1000

        var count = 0
        // Simulate 5 offline terminals generating 200 codes each
        for (terminal in 101..105) {
            for (counter in 1..200) {
                val code = TrackingCodeGenerator.generate(terminal, 295, counter)
                assertTrue("Code must be valid: $code", TrackingCodeGenerator.isValid(code))
                val isNew = generatedCodes.add(code)
                assertTrue("Generated code $code must be unique (0.0000% collision)", isNew)
                count++
            }
        }

        assertEquals(totalExpected, count)
        assertEquals(totalExpected, generatedCodes.size)
    }
}
