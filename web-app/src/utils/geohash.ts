/**
 * High-performance, zero-dependency Base32 Geohash utility for Web & TypeScript.
 * Implements standard Morton-order bit interleaving for spatial indexing.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'
const DECODE_MAP: Record<string, number> = {}
for (let i = 0; i < BASE32.length; i++) {
  DECODE_MAP[BASE32[i]] = i
}

export interface GeohashBoundingBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  centerLat: number
  centerLng: number
  latSpan: number
  lngSpan: number
}

/**
 * Encodes latitude and longitude into standard Base32 geohash.
 * @param lat Latitude (-90 to 90)
 * @param lng Longitude (-180 to 180)
 * @param precision Character length (1 to 12). Default 6 (~1.2km x 0.6km).
 */
export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let minLat = -90.0
  let maxLat = 90.0
  let minLng = -180.0
  let maxLng = 180.0

  let clampedLat = Math.max(-90.0, Math.min(90.0, lat))
  let clampedLng = Math.max(-180.0, Math.min(180.0, lng))
  const targetLength = Math.max(1, Math.min(12, precision))

  let result = ''
  let isEven = true
  let ch = 0
  let bit = 0

  while (result.length < targetLength) {
    if (isEven) {
      const mid = (minLng + maxLng) / 2.0
      if (clampedLng >= mid) {
        ch = (ch << 1) | 1
        minLng = mid
      } else {
        ch = ch << 1
        maxLng = mid
      }
    } else {
      const mid = (minLat + maxLat) / 2.0
      if (clampedLat >= mid) {
        ch = (ch << 1) | 1
        minLat = mid
      } else {
        ch = ch << 1
        maxLat = mid
      }
    }
    isEven = !isEven
    bit++

    if (bit === 5) {
      result += BASE32[ch]
      bit = 0
      ch = 0
    }
  }

  return result
}

/**
 * Decodes a geohash string into its bounding box boundaries.
 */
export function decodeGeohashBoundingBox(geohash: string): GeohashBoundingBox {
  let minLat = -90.0
  let maxLat = 90.0
  let minLng = -180.0
  let maxLng = 180.0
  let isEven = true

  const clean = geohash.toLowerCase().trim()
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]
    const cd = DECODE_MAP[char]
    if (cd === undefined) continue

    for (let j = 4; j >= 0; j--) {
      const mask = 1 << j
      if (isEven) {
        const mid = (minLng + maxLng) / 2.0
        if ((cd & mask) !== 0) {
          minLng = mid
        } else {
          maxLng = mid
        }
      } else {
        const mid = (minLat + maxLat) / 2.0
        if ((cd & mask) !== 0) {
          minLat = mid
        } else {
          maxLat = mid
        }
      }
      isEven = !isEven
    }
  }

  const centerLat = (minLat + maxLat) / 2.0
  const centerLng = (minLng + maxLng) / 2.0
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat,
    centerLng,
    latSpan: maxLat - minLat,
    lngSpan: maxLng - minLng
  }
}

/**
 * Decodes a geohash to its center coordinate.
 */
export function decodeGeohash(geohash: string): { latitude: number; longitude: number } {
  const bbox = decodeGeohashBoundingBox(geohash)
  return { latitude: bbox.centerLat, longitude: bbox.centerLng }
}

/**
 * Computes the 8 surrounding neighbor cells at the same precision level.
 */
export function getGeohashNeighbors8(geohash: string): string[] {
  if (!geohash) return []
  const precision = geohash.length
  const bbox = decodeGeohashBoundingBox(geohash)
  const lat = bbox.centerLat
  const lng = bbox.centerLng
  const dLat = bbox.latSpan
  const dLng = bbox.lngSpan

  const offsets: [number, number][] = [
    [dLat, 0.0],       // N
    [dLat, dLng],      // NE
    [0.0, dLng],       // E
    [-dLat, dLng],     // SE
    [-dLat, 0.0],      // S
    [-dLat, -dLng],    // SW
    [0.0, -dLng],      // W
    [dLat, -dLng]      // NW
  ]

  const neighbors = new Set<string>()
  for (const [latOff, lngOff] of offsets) {
    let nLat = lat + latOff
    let nLng = lng + lngOff
    if (nLat > 90.0) nLat = 90.0
    if (nLat < -90.0) nLat = -90.0
    if (nLng > 180.0) nLng -= 360.0
    if (nLng < -180.0) nLng += 360.0
    const nHash = encodeGeohash(nLat, nLng, precision)
    if (nHash !== geohash) {
      neighbors.add(nHash)
    }
  }

  return Array.from(neighbors)
}

/**
 * Fast Haversine Great-Circle distance formula in kilometers.
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(r * c * 100) / 100
}
