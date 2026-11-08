package com.dactor.patient.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class GeoHashUtilsTest {

    @Test
    fun testKathmanduGeohashEncoding() {
        val lat = 27.7042
        val lng = 85.3072
        val geohash6 = GeoHashUtils.encode(lat, lng, 6)
        val geohash9 = GeoHashUtils.encode(lat, lng, 9)

        // Kathmandu falls into the 'tuq4t' / 'tuq4tz' base32 cell
        assertTrue(geohash6.startsWith(("tuu")))
        assertEquals(6, geohash6.length)
        assertEquals(9, geohash9.length)
        assertTrue(geohash9.startsWith(geohash6))
    }

    @Test
    fun testDecodeBoundingBoxAndCenterRoundtrip() {
        val lat = 27.7172
        val lng = 85.3240
        val precision = 7
        val hash = GeoHashUtils.encode(lat, lng, precision)

        val bbox = GeoHashUtils.decodeBoundingBox(hash)
        assertTrue("lat must be within bbox minLat and maxLat", lat >= bbox.minLat && lat <= bbox.maxLat)
        assertTrue("lng must be within bbox minLng and maxLng", lng >= bbox.minLng && lng <= bbox.maxLng)

        val (centerLat, centerLng) = GeoHashUtils.decode(hash)
        assertTrue("Center lat error must be small", abs(centerLat - lat) < bbox.latSpan)
        assertTrue("Center lng error must be small", abs(centerLng - lng) < bbox.lngSpan)
    }

    @Test
    fun testNeighbors8Generation() {
        val hash = "tuq4tz"
        val neighbors = GeoHashUtils.getNeighbors8(hash)

        // Must generate 8 distinct neighbors of the same length
        assertEquals(8, neighbors.size)
        neighbors.forEach { n ->
            assertEquals(6, n.length)
            assertTrue("Neighbor should be close in Nepal grid (starts with tu)", n.startsWith("tu"))
        }
        assertTrue("Original hash should not be in its own neighbors list", !neighbors.contains(hash))
    }
}
