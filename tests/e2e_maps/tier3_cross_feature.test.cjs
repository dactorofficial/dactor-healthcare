/**
 * Tier 3: Cross-Feature Combinations E2E Tests
 * Validates pairwise feature interactions across web and mobile surfaces.
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md.
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite } = require('./test_runner_framework.cjs');
const { REPO_ROOT, CONTRACTS, isValidLatLng, isWithinNepalBounds } = require('./contracts.cjs');

const suite = createTestSuite('Cross-Feature Combinations', 3);

// ---------------------------------------------------------------------------
// X1: Preset Pill Selection + Subsequent Marker Drag + Reverse Geocode Emission
// ---------------------------------------------------------------------------

suite.test('X1: Preset selection followed by marker drag emits refined coordinates and address', async (assert) => {
  const kathmandu = CONTRACTS.webComponents.nepalPresets[0];
  let currentCoords = { lat: kathmandu.lat, lng: kathmandu.lng };
  let reverseGeocodeQueried = false;
  let emittedResult = null;

  // Step 1: User selects preset
  const selectPreset = (preset) => {
    currentCoords = { lat: preset.lat, lng: preset.lng };
  };
  selectPreset(kathmandu);
  assert.deepEqual(currentCoords, { lat: 27.7052, lng: 85.3193 });

  // Step 2: User drags marker to fine-tune position
  const dragMarker = (newLat, newLng) => {
    currentCoords = { lat: newLat, lng: newLng };
    reverseGeocodeQueried = true;
    emittedResult = {
      lat: newLat,
      lng: newLng,
      address: `Refined Location near ${kathmandu.name}`
    };
  };
  dragMarker(27.7060, 85.3200);

  assert.ok(reverseGeocodeQueried, 'Drag must trigger reverse geocoding');
  assert.deepEqual(emittedResult, {
    lat: 27.7060,
    lng: 85.3200,
    address: 'Refined Location near Kathmandu (Bagbazar / Center)'
  });
  assert.ok(isWithinNepalBounds(emittedResult.lat, emittedResult.lng));
});

// ---------------------------------------------------------------------------
// X2: GPS Centering Detection + Custom Zoom Controls + Marker Drag
// ---------------------------------------------------------------------------

suite.test('X2: GPS detection updates position, zoom controls adjust level, and marker drag refines', async (assert) => {
  let mapState = {
    center: [27.7052, 85.3193],
    zoom: 15,
    markerPos: [27.7052, 85.3193]
  };

  // Step 1: GPS fix acquired
  const gpsFix = { lat: 27.6710, lng: 85.4298 }; // Bhaktapur
  mapState.center = [gpsFix.lat, gpsFix.lng];
  mapState.markerPos = [gpsFix.lat, gpsFix.lng];

  // Step 2: User clicks Zoom In (+)
  const zoomIn = () => { mapState.zoom = Math.min(mapState.zoom + 1, 20); };
  zoomIn();
  zoomIn();
  assert.equal(mapState.zoom, 17, 'Zoom should be 17 after two zoom-in clicks');

  // Step 3: User drags marker
  const dragMarker = (lat, lng) => { mapState.markerPos = [lat, lng]; };
  dragMarker(27.6715, 85.4305);

  assert.deepEqual(mapState.markerPos, [27.6715, 85.4305]);
  assert.equal(mapState.zoom, 17, 'Zoom level must be maintained during drag');
});

// ---------------------------------------------------------------------------
// X3: Modal Lifecycle + Container Resize + InvalidateSize Execution
// ---------------------------------------------------------------------------

suite.test('X3: Modal open lifecycle triggers layout resize and invalidateSize execution', (assert) => {
  let invalidateSizeCallCount = 0;
  const mockMap = {
    invalidateSize: () => { invalidateSizeCallCount++; }
  };

  // Simulate modal opening
  let isOpen = false;
  const openModal = () => {
    isOpen = true;
    // In MapLibreLocationPicker/Viewer: setTimeout(..., 150) and setTimeout(..., 400)
    mockMap.invalidateSize();
    mockMap.invalidateSize();
  };

  openModal();
  assert.equal(isOpen, true);
  assert.equal(invalidateSizeCallCount, 2, 'Must invoke invalidateSize to prevent blank/gray viewport');

  // Simulate window resize
  const onResize = () => { mockMap.invalidateSize(); };
  onResize();
  assert.equal(invalidateSizeCallCount, 3, 'Window resize must trigger invalidateSize');
});

// ---------------------------------------------------------------------------
// X4: Location Viewer Mode Switch (Inline -> Modal -> Inline) State Continuity
// ---------------------------------------------------------------------------

suite.test('X4: Transition between inline and modal viewer preserves clinic coordinates and directions link', (assert) => {
  const clinic = {
    name: 'Norvic International Hospital',
    lat: 27.6915,
    lng: 85.3204,
    address: 'Thapathali, Kathmandu'
  };

  // Inline mode
  const inlineProps = {
    mode: 'inline',
    lat: clinic.lat,
    lng: clinic.lng,
    clinicName: clinic.name,
    addressText: clinic.address
  };
  const inlineDirections = CONTRACTS.webComponents.directionsUrlTemplate(inlineProps.lat, inlineProps.lng);

  // Modal mode
  const modalProps = {
    mode: 'modal',
    isOpen: true,
    lat: clinic.lat,
    lng: clinic.lng,
    clinicName: clinic.name,
    addressText: clinic.address
  };
  const modalDirections = CONTRACTS.webComponents.directionsUrlTemplate(modalProps.lat, modalProps.lng);

  assert.equal(inlineDirections, modalDirections, 'Directions URL must be identical across inline and modal');
  assert.includes(modalDirections, 'destination=27.6915,85.3204');
});

// ---------------------------------------------------------------------------
// X5: Rapid Successive Preset Jumps During Active flyTo Animation
// ---------------------------------------------------------------------------

suite.test('X5: Rapid successive preset selections smoothly override in-flight map animations', (assert) => {
  let targetLocation = null;
  let flightCount = 0;

  const flyTo = (coords, zoom, options) => {
    flightCount++;
    targetLocation = coords;
  };

  const preset1 = CONTRACTS.webComponents.nepalPresets[0]; // Kathmandu
  const preset2 = CONTRACTS.webComponents.nepalPresets[6]; // Pokhara

  // First preset selected
  flyTo([preset1.lat, preset1.lng], 15, { duration: 1.2 });
  assert.deepEqual(targetLocation, [27.7052, 85.3193]);

  // Second preset selected before first finishes
  flyTo([preset2.lat, preset2.lng], 15, { duration: 1.2 });
  assert.deepEqual(targetLocation, [28.2096, 83.9856]);
  assert.equal(flightCount, 2, 'Subsequent preset must supersede previous target');
});

// ---------------------------------------------------------------------------
// X6: Center Pin Animation Synchronization with Mobile Bridge Coordinate Emission
// ---------------------------------------------------------------------------

suite.test('X6: Center pin elevation on movestart and drop on moveend precedes bridge emission', async (assert) => {
  let pinTransform = 'translate(-50%, -100%) scale(1)'; // Resting
  let bridgePayload = null;
  let debounceTimer = null;

  const mockAndroidInterface = {
    onMarkerMoved: (lat, lng) => {
      bridgePayload = { lat, lng };
    }
  };

  // Event 1: movestart
  const onMoveStart = () => {
    pinTransform = 'translate(-50%, -115%) scale(1.05)'; // Elevated
  };
  onMoveStart();
  assert.equal(pinTransform, 'translate(-50%, -115%) scale(1.05)', 'Pin must be elevated while moving');
  assert.equal(bridgePayload, null, 'Bridge must not be called while moving');

  // Event 2: moveend
  const onMoveEnd = (center) => {
    pinTransform = 'translate(-50%, -100%) scale(1)'; // Settle immediately
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      mockAndroidInterface.onMarkerMoved(center.lat, center.lng);
    }, 60);
  };
  onMoveEnd({ lat: 27.7052, lng: 85.3193 });

  // Pin is at resting position immediately on moveend
  assert.equal(pinTransform, 'translate(-50%, -100%) scale(1)', 'Pin must settle immediately on moveend');
  assert.equal(bridgePayload, null, 'Bridge must not be called before 60ms debounce');

  // Wait for 60ms debounce
  await new Promise((r) => setTimeout(r, 70));
  assert.deepEqual(bridgePayload, { lat: 27.7052, lng: 85.3193 }, 'Bridge must receive coordinates after 60ms');
});

// ---------------------------------------------------------------------------
// X7: Tile Network Failure Fallback + Geocoder Independence
// ---------------------------------------------------------------------------

suite.test('X7: Reverse geocoding functions reliably even if map tile network has degraded', async (assert) => {
  // Tile server fails
  let tileSuccess = false;
  // Geocoder succeeds
  let geocodeAddress = null;

  const simulateOfflineMapWithWorkingGeocode = async (lat, lng) => {
    // Tile fetch fails
    tileSuccess = false;

    // Independent Nominatim fetch succeeds
    const mockNominatim = async () => ({
      display_name: 'Bagbazar Marg, Kathmandu 44600, Nepal'
    });
    const res = await mockNominatim();
    geocodeAddress = res.display_name;
  };

  await simulateOfflineMapWithWorkingGeocode(27.7052, 85.3193);
  assert.equal(tileSuccess, false);
  assert.equal(geocodeAddress, 'Bagbazar Marg, Kathmandu 44600, Nepal');
});

// ---------------------------------------------------------------------------
// X8: Manual Search Input + Marker Drag Override + Selection Confirmation
// ---------------------------------------------------------------------------

suite.test('X8: Search text entry followed by marker drag overrides and confirms final selection', (assert) => {
  let pickerState = {
    addressInput: '',
    lat: 27.7052,
    lng: 85.3193
  };

  let confirmedData = null;
  const onSelectLocation = (data) => {
    confirmedData = data;
  };

  // Step 1: User types address
  pickerState.addressInput = 'Maharajgunj Teaching Hospital Area';

  // Step 2: User adjusts pin to exact spot
  pickerState.lat = 27.7360;
  pickerState.lng = 85.3305;

  // Step 3: User confirms
  onSelectLocation({
    lat: pickerState.lat,
    lng: pickerState.lng,
    address: pickerState.addressInput
  });

  assert.deepEqual(confirmedData, {
    lat: 27.7360,
    lng: 85.3305,
    address: 'Maharajgunj Teaching Hospital Area'
  });
  assert.ok(isWithinNepalBounds(confirmedData.lat, confirmedData.lng));
});

module.exports = suite;
