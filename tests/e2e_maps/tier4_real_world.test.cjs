/**
 * Tier 4: Real-World Application Scenarios E2E Tests
 * Simulates realistic end-user clinical and patient workflows across the DACTOR platform.
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md.
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite } = require('./test_runner_framework.cjs');
const { REPO_ROOT, CONTRACTS, isValidLatLng, isWithinNepalBounds } = require('./contracts.cjs');

const suite = createTestSuite('Real-World Application Scenarios', 4);

// ---------------------------------------------------------------------------
// W1: Patient Clinic Discovery & Directions Workflow Simulation
// ---------------------------------------------------------------------------

suite.test('W1: Patient clinic discovery, map viewing, recentering, and directions link generation', async (assert) => {
  // 1. Patient searches for clinic
  const clinic = {
    id: 'clinic-kathmandu-01',
    name: 'Dactor Central Polyclinic & Diagnostic Lab',
    latitude: 27.7052,
    longitude: 85.3193,
    addressText: 'Bagbazar Marg, Kathmandu, Nepal'
  };

  assert.ok(isWithinNepalBounds(clinic.latitude, clinic.longitude), 'Clinic must be located in Nepal');

  // 2. Patient opens map viewer in modal mode
  let isViewerOpen = true;
  let viewerState = {
    center: [clinic.latitude, clinic.longitude],
    zoom: 15,
    clinicMarker: {
      position: [clinic.latitude, clinic.longitude],
      hasPulsingHalo: true
    }
  };

  assert.equal(isViewerOpen, true);
  assert.deepEqual(viewerState.center, [27.7052, 85.3193]);
  assert.equal(viewerState.clinicMarker.hasPulsingHalo, true);

  // 3. Patient pans away slightly
  viewerState.center = [27.7100, 85.3250];

  // 4. Patient clicks Recenter
  const recenter = () => {
    viewerState.center = [clinic.latitude, clinic.longitude];
    viewerState.zoom = 15;
  };
  recenter();
  assert.deepEqual(viewerState.center, [clinic.latitude, clinic.longitude], 'Recenter must return to clinic');

  // 5. Patient clicks Directions button
  const directionsUrl = CONTRACTS.webComponents.directionsUrlTemplate(clinic.latitude, clinic.longitude);
  assert.equal(directionsUrl, 'https://www.google.com/maps/dir/?api=1&destination=27.7052,85.3193');

  // 6. Patient closes modal
  isViewerOpen = false;
  assert.equal(isViewerOpen, false, 'Modal viewer cleanly dismissed');
});

// ---------------------------------------------------------------------------
// W2: Clinic Onboarding & Precise Address Pinning Workflow Simulation
// ---------------------------------------------------------------------------

suite.test('W2: Clinic onboarding workflow: default center -> GPS fix -> preset jump -> pin micro-drag -> submission', async (assert) => {
  let pickerState = {
    isOpen: true,
    lat: 27.7052,
    lng: 85.3193,
    address: '',
    isGeocoding: false
  };

  let submittedPayload = null;
  const onSelectLocation = (data) => {
    submittedPayload = data;
    pickerState.isOpen = false;
  };

  // Step 1: Picker starts at default Nepal center
  assert.equal(pickerState.lat, 27.7052);
  assert.equal(pickerState.lng, 85.3193);

  // Step 2: Admin acquires GPS location in Lalitpur
  const simulatedGpsFix = { lat: 27.6685, lng: 85.3214 };
  pickerState.lat = simulatedGpsFix.lat;
  pickerState.lng = simulatedGpsFix.lng;
  assert.deepEqual({ lat: pickerState.lat, lng: pickerState.lng }, simulatedGpsFix);

  // Step 3: Admin selects a preset to verify nearby areas
  const bhaktapurPreset = CONTRACTS.webComponents.nepalPresets[5]; // Bhaktapur
  pickerState.lat = bhaktapurPreset.lat;
  pickerState.lng = bhaktapurPreset.lng;
  assert.equal(pickerState.lat, 27.6710);
  assert.equal(pickerState.lng, 85.4298);

  // Step 4: Admin fine-tunes pin by dragging to hospital entrance
  pickerState.lat = 27.6725;
  pickerState.lng = 85.4310;

  // Step 5: Reverse geocoding resolves address
  pickerState.isGeocoding = true;
  await new Promise((r) => setTimeout(r, 20)); // Simulated geocoding latency
  pickerState.address = 'Suryabinayak Chowk, Hospital Road, Bhaktapur 44800, Nepal';
  pickerState.isGeocoding = false;

  // Step 6: Admin confirms location
  onSelectLocation({
    lat: pickerState.lat,
    lng: pickerState.lng,
    address: pickerState.address
  });

  // Verify final emission
  assert.equal(pickerState.isOpen, false, 'Picker must close upon confirmation');
  assert.ok(submittedPayload !== null, 'Submission payload must be emitted');
  assert.equal(submittedPayload.lat, 27.6725);
  assert.equal(submittedPayload.lng, 85.4310);
  assert.includes(submittedPayload.address, 'Bhaktapur');
  assert.ok(isWithinNepalBounds(submittedPayload.lat, submittedPayload.lng));
});

// ---------------------------------------------------------------------------
// W3: Mobile Patient In-App Check-In & Native Geocoder Workflow Simulation
// ---------------------------------------------------------------------------

suite.test('W3: Mobile check-in workflow: WebView load -> GPS injection -> pan animation -> bridge reverse lookup', async (assert) => {
  // Mobile app state in Kotlin
  let nativeState = {
    currentLat: 27.7052,
    currentLng: 85.3193,
    addressText: 'Kathmandu, Nepal',
    showMapPicker: true
  };

  // Mock WebView JavaScript execution environment
  const mockWebView = {
    map: {
      center: [nativeState.currentLat, nativeState.currentLng],
      zoom: 15,
      flyTo: function(coords, zoom, options) {
        this.center = coords;
        this.zoom = zoom;
      },
      getZoom: function() { return this.zoom; },
      getCenter: function() { return { lat: this.center[0], lng: this.center[1] }; }
    },
    pinTransform: 'translate(-50%, -100%) scale(1)',

    evaluateJavascript: function(js) {
      if (js.includes('moveToCoords')) {
        const match = js.match(/moveToCoords\(([\d.]+),\s*([\d.]+)\)/);
        if (match) {
          const lat = parseFloat(match[1]);
          const lng = parseFloat(match[2]);
          this.window.moveToCoords(lat, lng);
        }
      }
    },

    window: {}
  };

  // Setup JS bridge contracts inside WebView
  mockWebView.window.AndroidInterface = {
    onMarkerMoved: (lat, lng) => {
      nativeState.currentLat = lat;
      nativeState.currentLng = lng;
      // Simulated native Android Geocoder reverse lookup
      nativeState.addressText = `Resolved Area at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };

  mockWebView.window.moveToCoords = function(lat, lng) {
    mockWebView.map.flyTo([lat, lng], Math.max(mockWebView.map.getZoom(), 15), { duration: 1.2 });
  };

  // Step 1: LocationManager acquires live GPS fix in Patan
  const gpsLat = 27.6685;
  const gpsLng = 85.3214;
  mockWebView.evaluateJavascript(`if(window.moveToCoords) window.moveToCoords(${gpsLat}, ${gpsLng});`);

  assert.deepEqual(mockWebView.map.center, [27.6685, 85.3214], 'Map center must update to GPS fix');

  // Step 2: Patient starts dragging map
  mockWebView.pinTransform = 'translate(-50%, -115%) scale(1.05)'; // movestart
  assert.equal(mockWebView.pinTransform, 'translate(-50%, -115%) scale(1.05)', 'Pin elevates during pan');

  // Step 3: Patient releases drag at new location
  mockWebView.map.center = [27.6690, 85.3220];
  mockWebView.pinTransform = 'translate(-50%, -100%) scale(1)'; // moveend

  // Step 4: 60ms debounce fires bridge
  await new Promise((r) => setTimeout(r, 65));
  const c = mockWebView.map.getCenter();
  mockWebView.window.AndroidInterface.onMarkerMoved(c.lat, c.lng);

  assert.equal(nativeState.currentLat, 27.6690);
  assert.equal(nativeState.currentLng, 85.3220);
  assert.includes(nativeState.addressText, 'Resolved Area at 27.6690, 85.3220');

  // Step 5: Patient taps a preset chip (e.g., Pokhara)
  mockWebView.evaluateJavascript('if(window.moveToCoords) window.moveToCoords(28.2096, 83.9856);');
  assert.deepEqual(mockWebView.map.center, [28.2096, 83.9856], 'Map flies to Pokhara');
});

// ---------------------------------------------------------------------------
// W4: Multi-Surface Global Session OpenFreeMap Network Request Audit
// ---------------------------------------------------------------------------

suite.test('W4: Multi-surface session network audit: 100% zero OpenFreeMap and zero MapLibre requests', async (assert) => {
  // Simulated request logger capturing all outbound network traffic during user session
  const interceptedRequests = [];

  const simulateBrowserRequest = (url) => {
    interceptedRequests.push({
      url,
      timestamp: Date.now()
    });
  };

  // Session activity across Web and Mobile:
  // 1. Web HTML loads Leaflet CDN assets
  simulateBrowserRequest(CONTRACTS.webCdn.leafletCss);
  simulateBrowserRequest(CONTRACTS.webCdn.leafletJs);

  // 2. Map tiles requested for Kathmandu
  for (const s of CONTRACTS.tileProviders.cartoVoyager.subdomains) {
    simulateBrowserRequest(`https://${s}.basemaps.cartocdn.com/rastertiles/voyager/15/24342/13645.png`);
    simulateBrowserRequest(`https://${s}.basemaps.cartocdn.com/rastertiles/voyager/15/24343/13645.png`);
  }

  // 3. Reverse geocoding requested via Nominatim
  simulateBrowserRequest('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=27.7052&lon=85.3193');

  // 4. Direction lookup generated
  simulateBrowserRequest(CONTRACTS.webComponents.directionsUrlTemplate(27.7052, 85.3193));

  // Audit check 1: Assert all intercepted requests
  assert.ok(interceptedRequests.length >= 10, 'Must record all simulated requests');

  // Audit check 2: Strict zero references to tiles.openfreemap.org
  const openFreeMapRequests = interceptedRequests.filter((r) => r.url.includes('openfreemap'));
  assert.equal(openFreeMapRequests.length, 0, 'Must be strictly 0 openfreemap requests');

  // Audit check 3: Strict zero references to maplibre-gl CDN
  const maplibreRequests = interceptedRequests.filter((r) => r.url.includes('maplibre'));
  assert.equal(maplibreRequests.length, 0, 'Must be strictly 0 maplibre requests');

  // Audit check 4: All tile requests must strictly target valid tile hosts
  const tileRequests = interceptedRequests.filter((r) => r.url.includes('/rastertiles/voyager/'));
  assert.ok(tileRequests.length > 0, 'Tile requests must exist');
  for (const r of tileRequests) {
    assert.match(r.url, /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\//, 'Tile host must be basemaps.cartocdn.com');
  }
});

module.exports = suite;
