package com.dactor.patient.util

import kotlin.math.max
import kotlin.math.min

/**
 * High-performance, zero-dependency Base32 Geohash utility.
 * Implements standard Morton-order bit interleaving for spatial indexing.
 */
object GeoHashUtils {

    private const val BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
    private val DECODE_MAP = IntArray(128) { -1 }.apply {
        BASE32.forEachIndexed { index, char ->
            this[char.code] = index
        }
    }

    data class BoundingBox(
        val minLat: Double,
        val maxLat: Double,
        val minLng: Double,
        val maxLng: Double
    ) {
        val centerLat: Double get() = (minLat + maxLat) / 2.0
        val centerLng: Double get() = (minLng + maxLng) / 2.0
        val latSpan: Double get() = maxLat - minLat
        val lngSpan: Double get() = maxLng - minLng
    }

    /**
     * Encodes latitude and longitude into a standard Base32 geohash string.
     * @param lat Latitude (-90.0 to 90.0)
     * @param lng Longitude (-180.0 to 180.0)
     * @param precision Number of Base32 characters (1 to 12). Default 6 (~1.2km x 0.6km).
     */
    fun encode(lat: Double, lng: Double, precision: Int = 6): String {
        val clampedLat = max(-90.0, min(90.0, lat))
        val clampedLng = max(-180.0, min(180.0, lng))
        val targetLength = max(1, min(12, precision))

        var minLat = -90.0
        var maxLat = 90.0
        var minLng = -180.0
        var maxLng = 180.0

        val builder = StringBuilder(targetLength)
        var isEven = true
        var ch = 0
        var bit = 0

        while (builder.length < targetLength) {
            if (isEven) {
                val mid = (minLng + maxLng) / 2.0
                if (clampedLng >= mid) {
                    ch = (ch shl 1) or 1
                    minLng = mid
                } else {
                    ch = ch shl 1
                    maxLng = mid
                }
            } else {
                val mid = (minLat + maxLat) / 2.0
                if (clampedLat >= mid) {
                    ch = (ch shl 1) or 1
                    minLat = mid
                } else {
                    ch = ch shl 1
                    maxLat = mid
                }
            }
            isEven = !isEven
            bit++

            if (bit == 5) {
                builder.append(BASE32[ch])
                bit = 0
                ch = 0
            }
        }
        return builder.toString()
    }

    /**
     * Decodes a geohash string into its bounding box.
     */
    fun decodeBoundingBox(geohash: String): BoundingBox {
        var minLat = -90.0
        var maxLat = 90.0
        var minLng = -180.0
        var maxLng = 180.0
        var isEven = true

        val cleanHash = geohash.lowercase().trim()
        for (char in cleanHash) {
            val charCode = char.code
            if (charCode >= DECODE_MAP.size || DECODE_MAP[charCode] == -1) continue
            val cd = DECODE_MAP[charCode]

            for (j in 4 downTo 0) {
                val mask = 1 shl j
                if (isEven) {
                    val mid = (minLng + maxLng) / 2.0
                    if ((cd and mask) != 0) {
                        minLng = mid
                    } else {
                        maxLng = mid
                    }
                } else {
                    val mid = (minLat + maxLat) / 2.0
                    if ((cd and mask) != 0) {
                        minLat = mid
                    } else {
                        maxLat = mid
                    }
                }
                isEven = !isEven
            }
        }
        return BoundingBox(minLat, maxLat, minLng, maxLng)
    }

    /**
     * Decodes a geohash string into its center (latitude, longitude).
     */
    fun decode(geohash: String): Pair<Double, Double> {
        val bbox = decodeBoundingBox(geohash)
        return Pair(bbox.centerLat, bbox.centerLng)
    }

    /**
     * Computes the 8 adjacent neighboring geohashes (N, NE, E, SE, S, SW, W, NW)
     * at the same precision level to prevent boundary misses during spatial range checks.
     */
    fun getNeighbors8(geohash: String): List<String> {
        if (geohash.isBlank()) return emptyList()
        val precision = geohash.length
        val bbox = decodeBoundingBox(geohash)
        val lat = bbox.centerLat
        val lng = bbox.centerLng
        val dLat = bbox.latSpan
        val dLng = bbox.lngSpan

        val neighborOffsets = arrayOf(
            dLat to 0.0,          // N
            dLat to dLng,         // NE
            0.0 to dLng,          // E
            -dLat to dLng,        // SE
            -dLat to 0.0,         // S
            -dLat to -dLng,       // SW
            0.0 to -dLng,         // W
            dLat to -dLng         // NW
        )

        return neighborOffsets.map { (latOff, lngOff) ->
            var nLat = lat + latOff
            var nLng = lng + lngOff
            // Wrap / clamp boundaries
            if (nLat > 90.0) nLat = 90.0
            if (nLat < -90.0) nLat = -90.0
            if (nLng > 180.0) nLng -= 360.0
            if (nLng < -180.0) nLng += 360.0
            encode(nLat, nLng, precision)
        }.distinct()
    }
}
