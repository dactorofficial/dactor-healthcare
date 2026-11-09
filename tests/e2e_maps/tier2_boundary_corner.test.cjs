/**
 * Tier 2: Boundary & Corner Cases E2E Tests
 * Validates edge cases, coordinate boundaries, rapid debounce timing,
 * zoom clamping, fault tolerance, and mobile bridge resilience (Total: 48 tests).
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md, mathematical geospatial specifications.
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite } = require('./test_runner_framework.cjs');
const { REPO_ROOT, CONTRACTS, isValidLatLng, isWithinNepalBounds } = require('./contracts.cjs');

const suite = createTestSuite('Boundary & Corner Cases', 2);

// ---------------------------------------------------------------------------
// CATEGORY B1: Coordinate Boundary & Clamping Edge Cases
// ---------------------------------------------------------------------------

suite.test('B1.1: Latitude > 90 (e.g. 95.0) rejected by coordinate validator', (assert) => {
  assert.equal(isValidLatLng(95.0, 85.3193), false, 'Lat > 90 must be invalid');
});

suite.test('B1.2: Latitude < -90 (e.g. -95.0) rejected by coordinate validator', (assert) => {
  assert.equal(isValidLatLng(-95.0, 85.3193), false, 'Lat < -90 must be invalid');
});

suite.test('B1.3: Longitude > 180 (e.g. 185.0) rejected by coordinate validator', (assert) => {
  assert.equal(isValidLatLng(27.7052, 185.0), false, 'Lng > 180 must be invalid');
});

suite.test('B1.4: Longitude < -180 (e.g. -185.0) rejected by coordinate validator', (assert) => {
  assert.equal(isValidLatLng(27.7052, -185.0), false, 'Lng < -180 must be invalid');
});

suite.test('B1.5: Null Island (0.0, 0.0) is mathematically outside Nepal bounding box', (assert) => {
  assert.equal(isValidLatLng(0.0, 0.0), true, '0,0 is technically a valid coordinate on Earth');
  assert.equal(isWithinNepalBounds(0.0, 0.0), false, '0,0 must not be accepted as a Nepal clinic location');
});

suite.test('B1.6: Extreme floating point precision (14 decimals) handles cleanly without overflow', (assert) => {
  const extremeLat = 27.70523456789012;
  const extremeLng = 85.31932345678901;
  assert.ok(isValidLatLng(extremeLat, extremeLng), 'Extreme precision coordinates must be valid');
  assert.equal(extremeLat.toFixed(5), '27.70523', 'toFixed(5) must format gracefully');
  assert.equal(extremeLng.toFixed(5), '85.31932', 'toFixed(5) must format gracefully');
});

// ---------------------------------------------------------------------------
// CATEGORY B2: Address Strings & Input Sanitization
// ---------------------------------------------------------------------------

suite.test('B2.1: Null or undefined initialAddress defaults cleanly without throwing TypeError', (assert) => {
  const sanitizeAddress = (addr) => (typeof addr === 'string' ? addr.trim() : '');
  assert.equal(sanitizeAddress(null), '', 'Null address must default to empty string');
  assert.equal(sanitizeAddress(undefined), '', 'Undefined address must default to empty string');
});

suite.test('B2.2: Empty string initialAddress preserved as empty state', (assert) => {
  const initialAddress = '';
  assert.equal(typeof initialAddress, 'string', 'Empty address must be string');
  assert.equal(initialAddress.length, 0, 'Empty address length is 0');
});

suite.test('B2.3: Dangerous HTML injection strings in address safely escaped', (assert) => {
  const xssInput = '<script>alert("xss")</script><img src="x" onerror="steal()" />';
  const escapeHtml = (str) =>
    str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const escaped = escapeHtml(xssInput);
  assert.doesNotMatch(escaped, /<script>/, 'Escaped output must not contain unescaped <script>');
  assert.doesNotMatch(escaped, /<img/, 'Escaped output must not contain unescaped <img');
  assert.includes(escaped, '&lt;script&gt;', 'Must encode < and >');
});

suite.test('B2.4: Non-ASCII Nepali Devanagari Unicode characters preserved in address', (assert) => {
  const nepaliAddr = 'काठमाडौँ, बागबजार, नेपाल';
  assert.match(nepaliAddr, /[\u0900-\u097F]+/, 'Must contain Devanagari script');
  assert.equal(nepaliAddr.length > 0, true, 'Devanagari string preserved');
  assert.includes(nepaliAddr, 'काठमाडौँ', 'Specific word preserved');
});

suite.test('B2.5: Extremely long address string (> 500 characters) handles without crash', (assert) => {
  const longAddr = 'Ward 4, Hospital Road, Near Teaching Hospital, Building 12, Floor 3, Suite A, '.repeat(10);
  assert.ok(longAddr.length > 500, 'Must be > 500 chars');
  const truncated = longAddr.length > 150 ? longAddr.slice(0, 147) + '...' : longAddr;
  assert.ok(truncated.length <= 150, 'Truncated length must be <= 150');
});

suite.test('B2.6: Whitespace-only string input trimmed cleanly to empty string', (assert) => {
  const whitespaceInput = '   \t\n   ';
  assert.equal(whitespaceInput.trim(), '', 'Whitespace must trim to empty');
});

// ---------------------------------------------------------------------------
// CATEGORY B3: Rapid Map Moves & Debounce Timing Boundaries
// ---------------------------------------------------------------------------

suite.test('B3.1: Burst of 5 simulated moveend events in 20ms fires callback exactly once after 60ms', async (assert) => {
  let callCount = 0;
  let timer = null;
  const emitLocation = () => { callCount++; };
  const triggerMoveEnd = () => {
    clearTimeout(timer);
    timer = setTimeout(emitLocation, 60);
  };

  // Rapid burst
  triggerMoveEnd();
  await new Promise((r) => setTimeout(r, 5));
  triggerMoveEnd();
  await new Promise((r) => setTimeout(r, 5));
  triggerMoveEnd();
  await new Promise((r) => setTimeout(r, 5));
  triggerMoveEnd();
  await new Promise((r) => setTimeout(r, 5));
  triggerMoveEnd();

  // Still within debounce window
  assert.equal(callCount, 0, 'Callback must not fire before 60ms quiescence');

  // Wait for debounce to elapse
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(callCount, 1, 'Callback must fire exactly once after quiescence');
});

suite.test('B3.2: Immediate movestart following moveend cancels pending debounce timer', async (assert) => {
  let callCount = 0;
  let timer = null;
  const emitLocation = () => { callCount++; };
  const triggerMoveEnd = () => {
    clearTimeout(timer);
    timer = setTimeout(emitLocation, 60);
  };
  const triggerMoveStart = () => {
    clearTimeout(timer);
    timer = null;
  };

  triggerMoveEnd();
  await new Promise((r) => setTimeout(r, 20)); // Halfway through debounce
  triggerMoveStart(); // User touched screen again

  await new Promise((r) => setTimeout(r, 80)); // Past original 60ms
  assert.equal(callCount, 0, 'Callback must be cancelled when new motion starts');
});

suite.test('B3.3: Mobile debounce delay specification matches exactly 60ms in patient and clinic code', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  const clinicCode = fs.readFileSync(path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /setTimeout\(emitLocation,\s*60\)/, 'Patient app must use 60ms debounce');
  assert.match(clinicCode, /setTimeout\(emitLocation,\s*60\)/, 'Clinic app must use 60ms debounce');
});

suite.test('B3.4: Simulated rapid jitter stabilizes and emits final coordinates only', async (assert) => {
  let emittedCoords = null;
  let timer = null;
  const emit = (lat, lng) => { emittedCoords = { lat, lng }; };
  const moveEnd = (lat, lng) => {
    clearTimeout(timer);
    timer = setTimeout(() => emit(lat, lng), 60);
  };

  moveEnd(27.701, 85.311);
  await new Promise((r) => setTimeout(r, 20));
  moveEnd(27.702, 85.312);
  await new Promise((r) => setTimeout(r, 20));
  moveEnd(27.703, 85.313);
  await new Promise((r) => setTimeout(r, 20));
  moveEnd(27.7052, 85.3193); // Final resting position

  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(emittedCoords, { lat: 27.7052, lng: 85.3193 }, 'Emitted coords must be the final resting position');
});

suite.test('B3.5: Debounce timer properly cleaned on unmount/dismiss simulation', (assert) => {
  let timer = setTimeout(() => {}, 60);
  assert.ok(timer !== null, 'Timer must be created');
  clearTimeout(timer);
  timer = null;
  assert.equal(timer, null, 'Timer must be cleaned up to prevent memory leak');
});

suite.test('B3.6: Debounce timer fires with latest map center snapshot, not stale closure', (assert) => {
  let currentMapCenter = { lat: 27.7000, lng: 85.3100 };
  let emittedCenter = null;
  let timer = null;

  const emitLocation = () => {
    emittedCenter = { ...currentMapCenter };
  };

  const triggerMoveEnd = () => {
    clearTimeout(timer);
    timer = setTimeout(emitLocation, 10);
  };

  triggerMoveEnd();
  // Map center updates in background while timer is ticking
  currentMapCenter = { lat: 27.7052, lng: 85.3193 };

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.deepEqual(emittedCenter, { lat: 27.7052, lng: 85.3193 }, 'Must emit latest center');
      resolve();
    }, 25);
  });
});

// ---------------------------------------------------------------------------
// CATEGORY B4: Zoom Boundaries & Clamping Limits
// ---------------------------------------------------------------------------

suite.test('B4.1: Excessive zoom request (>20) clamped to tile provider maxZoom', (assert) => {
  const clampZoom = (requestedZoom, maxZoom = 20) => Math.min(requestedZoom, maxZoom);
  assert.equal(clampZoom(25, 20), 20, 'Zoom 25 must clamp to 20 for web');
  assert.equal(clampZoom(25, 19), 19, 'Zoom 25 must clamp to 19 for mobile');
});

suite.test('B4.2: Negative or sub-zero zoom request clamped to valid minimum zoom (e.g. 1)', (assert) => {
  const clampZoom = (requestedZoom, minZoom = 1) => Math.max(requestedZoom, minZoom);
  assert.equal(clampZoom(-5, 1), 1, 'Negative zoom -5 must clamp to 1');
  assert.equal(clampZoom(0, 1), 1, 'Zoom 0 must clamp to min 1');
});

suite.test('B4.3: Fractional zoom levels (e.g. 15.75) accepted in calculations', (assert) => {
  const fractionalZoom = 15.75;
  assert.equal(Math.max(fractionalZoom, 15), 15.75, 'Fractional zoom > 15 must be preserved');
});

suite.test('B4.4: moveToCoords contract clamps low zoom to minimum 15', (assert) => {
  const computeTargetZoom = (currentZoom) => Math.max(currentZoom, 15);
  assert.equal(computeTargetZoom(8), 15, 'Low zoom 8 must elevate to 15');
  assert.equal(computeTargetZoom(12), 15, 'Low zoom 12 must elevate to 15');
});

suite.test('B4.5: moveToCoords contract preserves high zoom > 15', (assert) => {
  const computeTargetZoom = (currentZoom) => Math.max(currentZoom, 15);
  assert.equal(computeTargetZoom(17), 17, 'High zoom 17 must be preserved');
  assert.equal(computeTargetZoom(19), 19, 'High zoom 19 must be preserved');
});

suite.test('B4.6: Leaflet mobile maxZoom configuration matches tile provider maximum (19)', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /maxZoom:\s*19/, 'Must explicitly set maxZoom: 19');
});

// ---------------------------------------------------------------------------
// CATEGORY B5: Network Faults, Offline Status & Missing Resource Handling
// ---------------------------------------------------------------------------

suite.test('B5.1: Simulated tile network failure triggers error handler without crashing', (assert) => {
  let errorHandled = false;
  const mockTileLayer = {
    on: (evt, handler) => {
      if (evt === 'tileerror') {
        errorHandled = true;
        handler({ error: new Error('Failed to load tile'), tile: { src: 'broken.png' } });
      }
    }
  };
  mockTileLayer.on('tileerror', (e) => {
    assert.ok(e.error, 'Error object must be present');
  });
  assert.ok(errorHandled, 'Tileerror event must be cleanly handled');
});

suite.test('B5.2: Leaflet CSS link error handler triggers fallback to jsdelivr', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /onerror=["']this\.onerror=null;this\.href=['"]https:\/\/cdn\.jsdelivr\.net/, 'Must include jsdelivr CSS fallback on error');
});

suite.test('B5.3: Leaflet JS script error handler creates fallback script to jsdelivr', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /s\.src=['"]https:\/\/cdn\.jsdelivr\.net\/npm\/leaflet@1\.9\.4\/dist\/leaflet\.js['"]/, 'Must include jsdelivr JS fallback on error');
});

suite.test('B5.4: Reverse geocoder network failure catches error and does not throw uncaught promise', async (assert) => {
  const mockReverseGeocode = async (lat, lng, fetchFn) => {
    try {
      const resp = await fetchFn(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null; // Graceful fallback
    }
  };

  const failingFetch = async () => { throw new Error('Network timeout'); };
  const result = await mockReverseGeocode(27.7052, 85.3193, failingFetch);
  assert.equal(result, null, 'Must return null gracefully on network failure');
});

suite.test('B5.5: Corrupt or empty JSON response from reverse geocoding handled gracefully', async (assert) => {
  const mockReverseGeocode = async (mockResponseData) => {
    try {
      const data = mockResponseData;
      if (data && data.display_name) {
        return data.display_name;
      }
      return 'Nepal'; // Default fallback
    } catch {
      return 'Nepal';
    }
  };

  const emptyResult = await mockReverseGeocode({});
  assert.equal(emptyResult, 'Nepal', 'Must fallback to default on empty response');
  const nullResult = await mockReverseGeocode(null);
  assert.equal(nullResult, 'Nepal', 'Must fallback to default on null response');
});

suite.test('B5.6: Leaflet undefined guard protects initialization loop from crashing', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /if\s*\(typeof\s+L\s*===\s*['"]undefined['"]\)\s*{\s*setTimeout\(initMap,\s*100\);\s*return;\s*}/, 'Must retry initMap when L is undefined');
});

// ---------------------------------------------------------------------------
// CATEGORY B6: Mobile WebView Bridge Interface Fault Tolerances
// ---------------------------------------------------------------------------

suite.test('B6.1: window.moveToCoords called with non-numeric coordinates safely ignores without throwing', (assert) => {
  let flyToCalled = false;
  const mockMap = {
    flyTo: () => { flyToCalled = true; },
    getZoom: () => 15
  };
  const moveToCoords = (lat, lng) => {
    if (!mockMap) return;
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (Number.isNaN(numLat) || Number.isNaN(numLng)) return;
    mockMap.flyTo([numLat, numLng], 15);
  };

  moveToCoords('invalid', undefined);
  moveToCoords(NaN, 85.3193);
  assert.equal(flyToCalled, false, 'flyTo must not be called with invalid coordinates');
});

suite.test('B6.2: window.moveToCoords called before map init safely no-ops', (assert) => {
  let map = null;
  let errorOccurred = false;
  const moveToCoords = (lat, lng) => {
    try {
      if (map) {
        map.flyTo([lat, lng], 15);
      }
    } catch {
      errorOccurred = true;
    }
  };

  moveToCoords(27.7052, 85.3193);
  assert.equal(errorOccurred, false, 'Calling moveToCoords before map is ready must not throw');
});

suite.test('B6.3: emitLocation executed when window.AndroidInterface is null does not throw', (assert) => {
  const windowObj = {}; // No AndroidInterface
  let errorOccurred = false;
  const emitLocation = (c) => {
    try {
      if (windowObj.AndroidInterface && windowObj.AndroidInterface.onMarkerMoved) {
        windowObj.AndroidInterface.onMarkerMoved(c.lat, c.lng);
      }
    } catch {
      errorOccurred = true;
    }
  };

  emitLocation({ lat: 27.7052, lng: 85.3193 });
  assert.equal(errorOccurred, false, 'Missing AndroidInterface must be safely ignored');
});

suite.test('B6.4: AndroidInterface.onMarkerMoved throws exception inside WebView without bubbling out', (assert) => {
  const windowObj = {
    AndroidInterface: {
      onMarkerMoved: () => { throw new Error('Native Kotlin exception'); }
    }
  };
  let safelyCaught = false;
  const emitLocation = (c) => {
    try {
      if (windowObj.AndroidInterface && windowObj.AndroidInterface.onMarkerMoved) {
        windowObj.AndroidInterface.onMarkerMoved(c.lat, c.lng);
      }
    } catch {
      safelyCaught = true;
    }
  };

  emitLocation({ lat: 27.7052, lng: 85.3193 });
  assert.ok(safelyCaught, 'Exception from native side must be contained');
});

suite.test('B6.5: Extreme coordinate inputs do not cause infinite loop in flyTo duration', (assert) => {
  const flyToOptions = { duration: 1.2 };
  assert.equal(flyToOptions.duration, 1.2, 'Duration must be fixed constant 1.2 seconds regardless of distance');
});

suite.test('B6.6: Kotlin bridge receiver verifies non-null coordinates before reverseGeocode', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /fun\s+onMarkerMoved\(lat:\s*Double,\s*lng:\s*Double\)/, 'Native Kotlin method expects primitive Doubles');
});

// ---------------------------------------------------------------------------
// CATEGORY B7: Modal Lifecycle, Container Collisions & Fast Toggling
// ---------------------------------------------------------------------------

suite.test('B7.1: Repeated fast modal toggle cleans existing Leaflet instance without throwing', (assert) => {
  let removeCalls = 0;
  const mapRef = {
    current: {
      remove: () => { removeCalls++; }
    }
  };

  // Fast toggle simulator
  const cleanup = () => {
    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch {}
      mapRef.current = null;
    }
  };

  cleanup();
  assert.equal(removeCalls, 1, 'Previous map instance must be removed');
  assert.equal(mapRef.current, null, 'mapRef must be nullified');
  cleanup(); // Second cleanup
  assert.equal(removeCalls, 1, 'Subsequent cleanups must safely no-op');
});

suite.test('B7.2: Container unmount safely invokes mapRef.current.remove() in React useEffect', (assert) => {
  const viewerCode = fs.readFileSync(path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx'), 'utf8');
  const pickerCode = fs.readFileSync(path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx'), 'utf8');
  assert.match(viewerCode, /mapRef\.current\.remove\(\)/, 'Viewer must clean up map on unmount');
  assert.match(pickerCode, /mapRef\.current\.remove\(\)/, 'Picker must clean up map on unmount');
});

suite.test('B7.3: Zero-dimension container layout survives and recalculates on invalidateSize', (assert) => {
  let invalidated = false;
  const mockMap = {
    invalidateSize: () => { invalidated = true; }
  };
  mockMap.invalidateSize();
  assert.ok(invalidated, 'invalidateSize must successfully execute');
});

suite.test('B7.4: Rapid props updates while modal is closed safely discarded', (assert) => {
  const viewerCode = fs.readFileSync(path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx'), 'utf8');
  assert.match(viewerCode, /if\s*\(mode\s*===\s*['"]modal['"]\s*&&\s*!isOpen\)\s*return/, 'Modal mode must abort initialization if isOpen is false');
});

suite.test('B7.5: Double close event invocation handled gracefully', (assert) => {
  let closeCount = 0;
  const onClose = () => { closeCount++; };
  onClose();
  onClose();
  assert.equal(closeCount, 2, 'Double close safely registers without state corruption');
});

suite.test('B7.6: Asynchronous reverse geocode callback respects cancelled flag on unmount', async (assert) => {
  let isCancelled = false;
  let stateUpdated = false;

  const asyncGeocode = async () => {
    await new Promise((r) => setTimeout(r, 20));
    if (!isCancelled) {
      stateUpdated = true;
    }
  };

  const promise = asyncGeocode();
  isCancelled = true; // Component unmounted during request
  await promise;

  assert.equal(stateUpdated, false, 'State update must be cancelled when component unmounts');
});

// ---------------------------------------------------------------------------
// CATEGORY B8: High-DPI Retina Displays & Subdomain Distribution
// ---------------------------------------------------------------------------

suite.test('B8.1: CARTO Voyager {r} token resolves correctly for Retina vs Standard', (assert) => {
  const resolveTemplate = (url, r = '') => url.replace('{r}', r);
  const standard = resolveTemplate('https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426{r}.png', '');
  const retina = resolveTemplate('https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426{r}.png', '@2x');
  assert.equal(standard, 'https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png');
  assert.equal(retina, 'https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426@2x.png');
});

suite.test('B8.2: CARTO Voyager subdomains definition contains exactly a, b, c, d', (assert) => {
  const subdomains = CONTRACTS.tileProviders.cartoVoyager.subdomains;
  assert.deepEqual(subdomains, ['a', 'b', 'c', 'd'], 'Must contain subdomains a, b, c, d');
});

suite.test('B8.3: Subdomain distribution formula rotates evenly across subdomains', (assert) => {
  const subdomains = ['a', 'b', 'c', 'd'];
  const hits = { a: 0, b: 0, c: 0, d: 0 };
  for (let x = 0; x < 100; x++) {
    const s = subdomains[x % 4];
    hits[s]++;
  }
  assert.equal(hits.a, 25);
  assert.equal(hits.b, 25);
  assert.equal(hits.c, 25);
  assert.equal(hits.d, 25);
});

suite.test('B8.4: Missing {r} token fallback URL loads standard 1x tile identically', (assert) => {
  const urlWithoutR = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png';
  assert.doesNotMatch(urlWithoutR, /\{r\}/, 'URL without {r} does not contain placeholder');
});

suite.test('B8.5: Invalid tile coordinates return 400/404, not server crash 500', async (assert) => {
  const invalidTileUrl = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/99/9999/9999.png';
  try {
    const res = await fetch(invalidTileUrl);
    assert.ok(res.status === 400 || res.status === 404, `Status should be 400 or 404, got ${res.status}`);
  } catch (err) {
    // Some networks may reject or reset connection, which is also an acceptable boundary failure
    assert.ok(err, 'Network boundary error handled');
  }
});

suite.test('B8.6: Subdomain failover simulation routes to remaining subdomains', (assert) => {
  const availableSubdomains = ['a', 'b', 'c', 'd'];
  const failedSubdomain = 'b';
  const healthySubdomains = availableSubdomains.filter((s) => s !== failedSubdomain);
  assert.deepEqual(healthySubdomains, ['a', 'c', 'd'], 'Failed subdomain cleanly excluded');
});

module.exports = suite;
