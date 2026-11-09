/**
 * DACTOR Platform Map Migration — Interface Contracts & Specifications
 * Authoritative source: PROJECT.md, ORIGINAL_REQUEST.md
 */

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const CONTRACTS = {
  // F1: Web CDN Script & Style Loading
  webCdn: {
    leafletCss: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    leafletJs: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    fallbackCss: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    fallbackJs: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    forbiddenCdnPatterns: [
      /maplibre-gl@[\d.]+\/dist\/maplibre-gl\.css/,
      /maplibre-gl@[\d.]+\/dist\/maplibre-gl\.js/,
      /tiles\.openfreemap\.org/
    ]
  },

  // F2 & F3: Web Components Interface
  webComponents: {
    pickerProps: ['isOpen', 'onClose', 'initialLat', 'initialLng', 'initialAddress', 'onSelectLocation'],
    viewerProps: ['lat', 'lng', 'clinicName', 'addressText', 'mode', 'isOpen', 'onClose', 'height', 'className'],
    defaultCoordinates: {
      lat: 27.7052,
      lng: 85.3193
    },
    nepalPresetsCount: 11,
    nepalPresets: [
      { name: 'Kathmandu (Bagbazar / Center)', lat: 27.7052, lng: 85.3193 },
      { name: 'Kathmandu (Thamel / Lazimpat)', lat: 27.7172, lng: 85.312 },
      { name: 'Kathmandu (Maharajgunj / TUTH)', lat: 27.736, lng: 85.3305 },
      { name: 'Kathmandu (New Baneshwor)', lat: 27.6915, lng: 85.342 },
      { name: 'Lalitpur (Lagankhel / Patan)', lat: 27.6685, lng: 85.3214 },
      { name: 'Bhaktapur (Suryabinayak)', lat: 27.671, lng: 85.4298 },
      { name: 'Pokhara (Lakeside / New Road)', lat: 28.2096, lng: 83.9856 },
      { name: 'Chitwan (Bharatpur Medical City)', lat: 27.6833, lng: 84.4333 },
      { name: 'Biratnagar (Main Road)', lat: 26.4525, lng: 87.2718 },
      { name: 'Butwal (Traffic Chowk)', lat: 27.7006, lng: 83.4484 },
      { name: 'Dharan (BPKIHS Area)', lat: 26.8124, lng: 87.2834 }
    ],
    reverseGeocodeUrlTemplate: 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lng}',
    directionsUrlTemplate: (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  },

  // F4 & F5 & F6: Mobile WebView & Bridge Contracts
  mobileBridge: {
    boundInterfaceName: 'AndroidInterface',
    onMarkerMovedMethod: 'onMarkerMoved',
    moveToCoordsMethod: 'moveToCoords',
    debounceDelayMs: 60,
    expectedBaseUrl: 'https://basemaps.cartocdn.com',
    flyToDurationSec: 1.2,
    defaultMinFlyToZoom: 15,
    pinElevationTransform: 'translate(-50%, -115%) scale(1.05)',
    pinRestingTransform: 'translate(-50%, -100%) scale(1)',
    patientPresetsCount: 10,
    clinicPresetsCount: 10
  },

  // F7: Tile Provider Specifications
  tileProviders: {
    cartoVoyager: {
      urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      subdomains: ['a', 'b', 'c', 'd'],
      maxZoomMobile: 19,
      maxZoomWeb: 20,
      expectedContentType: 'image/png'
    },
    osmRaster: {
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      requiredUserAgent: 'DactorMedicalApp/1.0'
    }
  },

  // F8: Repository Eradication Target
  eradication: {
    forbiddenStrings: [
      'tiles.openfreemap.org',
      'styles/bright'
    ],
    targetScanDirs: [
      'web-app/src',
      'web-app/index.html',
      'patient-app/app/src/main/java',
      'clinic-app/app/src/main/java',
      'admin-panel/src'
    ]
  }
};

/**
 * Coordinate bounds helper
 */
function isValidLatLng(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function isWithinNepalBounds(lat, lng) {
  if (!isValidLatLng(lat, lng)) return false;
  // Nepal bounding box roughly: Lat 26.3 - 30.5, Lng 80.0 - 88.3
  return lat >= 26.0 && lat <= 31.0 && lng >= 80.0 && lng <= 89.0;
}

module.exports = {
  REPO_ROOT,
  CONTRACTS,
  isValidLatLng,
  isWithinNepalBounds
};
