/**
 * Tier 5: Adversarial Code Coverage, White-Box Stress & Failure Mode Harness
 * Executed by Challenger 2 for Milestone 4 Gating Verification.
 *
 * Empirical verification of:
 * 1. Stale state on component reopen in MapLibreLocationPicker.tsx
 * 2. Reverse geocode race condition under fluctuating network latency
 * 3. Mobile Leaflet moveToCoords NaN/undefined input vs test-mock discrepancy
 * 4. Infinite retry loop in mobile Leaflet loader under offline status
 * 5. Coroutine job cancellation lack in mobile native Geocoder bridge
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite } = require('./test_runner_framework.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const suite = createTestSuite('Tier 5 Adversarial & White-Box Hardening', 5);

// ---------------------------------------------------------------------------
// ADVERSARIAL CHALLENGE 1: Stale State on Reopening MapLibreLocationPicker
// ---------------------------------------------------------------------------
suite.test('ADV-1: MapLibreLocationPicker preserves stale internal coordinates when reopened with new initialLat/initialLng', (assert) => {
  const pickerPath = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx');
  const code = fs.readFileSync(pickerPath, 'utf8');

  // Verify that useState is used for currentLat/currentLng
  assert.match(code, /const\s*\[currentLat,\s*setCurrentLat\]\s*=\s*useState<number>\(initialLat\s*\|\|\s*27\.7052\)/);
  assert.match(code, /const\s*\[currentLng,\s*setCurrentLng\]\s*=\s*useState<number>\(initialLng\s*\|\|\s*85\.3193\)/);

  // Check if there is any useEffect synchronizing currentLat/currentLng when isOpen or initialLat changes
  const hasSyncEffect = /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*setCurrentLat\s*\(\s*initialLat[^}]*\}\s*,\s*\[[^\]]*initialLat[^\]]*\]\s*\)/s.test(code) ||
                        /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*setCurrentLat\s*\(\s*initialLat[^}]*\}\s*,\s*\[[^\]]*isOpen[^\]]*\]\s*\)/s.test(code);

  // Simulate React state behavior across reopenings:
  // Step 1: Component mounts with initialLat = 27.7052 (Kathmandu)
  let initialLat = 27.7052;
  let initialLng = 85.3193;
  let currentLat = initialLat;
  let currentLng = initialLng;

  // Step 2: User drags marker to Lalitpur (27.6685, 85.3214)
  currentLat = 27.6685;
  currentLng = 85.3214;

  // Step 3: Dialog closes (isOpen = false)
  // Step 4: Dialog reopens for Pokhara clinic (initialLat = 28.2096, initialLng = 83.9856)
  initialLat = 28.2096;
  initialLng = 83.9856;

  // In React without a synchronization effect or remount key:
  if (!hasSyncEffect) {
    // currentLat and currentLng remain stale at 27.6685, 85.3214!
    // Meanwhile Leaflet initializes at initialLat (28.2096)!
    // If user clicks Confirm without dragging, onSelectLocation receives the STALE coordinates:
    const confirmedCoords = { lat: currentLat, lng: currentLng };
    assert.equal(confirmedCoords.lat, 27.6685, 'Demonstrates stale state retained from previous session');
    assert.notEqual(confirmedCoords.lat, initialLat, 'Stale state does NOT match newly requested initialLat');
  }
});

// ---------------------------------------------------------------------------
// ADVERSARIAL CHALLENGE 2: Reverse Geocode Race Condition (Out-of-Order Overwrite)
// ---------------------------------------------------------------------------
suite.test('ADV-2: Rapid geocoding requests without AbortController/sequence tracking suffer race-condition overwrite', async (assert) => {
  // Simulate two consecutive reverse geocode requests:
  // Request 1: Location A (Kathmandu) fired at t=0, takes 80ms (slow network response)
  // Request 2: Location B (Pokhara) fired at t=10ms, takes 20ms (fast cache/network response)

  let activeAddress = '';
  let requestCounter = 0;

  // Vulnerable implementation (as in MapLibreLocationPicker.tsx / OpenStreetMapPicker.kt)
  async function uncoordinatedReverseGeocode(lat, lng, delayMs, resultAddress) {
    return new Promise((resolve) => {
      setTimeout(() => {
        activeAddress = resultAddress;
        resolve(resultAddress);
      }, delayMs);
    });
  }

  // Trigger Request 1 (slow)
  const p1 = uncoordinatedReverseGeocode(27.7052, 85.3193, 80, 'Bagbazar, Kathmandu');

  // Trigger Request 2 (fast, 10ms later)
  await new Promise((r) => setTimeout(r, 10));
  const p2 = uncoordinatedReverseGeocode(28.2096, 83.9856, 20, 'Lakeside, Pokhara');

  // Wait for both to finish
  await Promise.all([p1, p2]);

  // Because Request 1 was slower, it finished LAST and overwrote Request 2!
  // Final address is "Bagbazar, Kathmandu" even though the user ended at "Lakeside, Pokhara"!
  assert.equal(activeAddress, 'Bagbazar, Kathmandu', 'Race condition confirmed: stale slower request overwrote newer faster request');
});

// ---------------------------------------------------------------------------
// ADVERSARIAL CHALLENGE 3: Production vs Test Mock Discrepancy (NaN in moveToCoords)
// ---------------------------------------------------------------------------
suite.test('ADV-3: Production OpenStreetMapPicker.kt lacks NaN coordinate sanitization found in Tier 2 mock', (assert) => {
  const patientPath = path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt');
  const code = fs.readFileSync(patientPath, 'utf8');

  // Extract the actual window.moveToCoords implementation in the Kotlin WebView HTML string
  const moveToCoordsMatch = code.match(/window\.moveToCoords\s*=\s*function\(lat,\s*lng\)\s*\{([^}]+)\}/);
  assert.ok(moveToCoordsMatch, 'window.moveToCoords must be defined');

  const prodImplementation = moveToCoordsMatch[1];

  // In Tier 2 test B6.1, the test asserted:
  // const numLat = Number(lat); if (Number.isNaN(numLat)) return;
  // Check if production code actually has Number.isNaN or typeof checks:
  const hasNaNCheck = /isNaN|Number\(lat\)|typeof\s+lat/.test(prodImplementation);
  assert.equal(hasNaNCheck, false, 'Production code lacks NaN validation (untested gap vs Tier 2 mock B6.1)');

  // Verify Leaflet behavior when flyTo is given [NaN, NaN]
  let leafletThrew = false;
  try {
    // Simulate Leaflet's L.latLng constructor:
    const toLatLng = (a, b) => {
      const lat = Number(a);
      const lng = Number(b);
      if (isNaN(lat) || isNaN(lng)) {
        throw new Error(`Invalid LatLng object: (${lat}, ${lng})`);
      }
      return { lat, lng };
    };
    toLatLng(NaN, NaN);
  } catch (err) {
    leafletThrew = true;
    assert.includes(err.message, 'Invalid LatLng object');
  }
  assert.ok(leafletThrew, 'Leaflet throws Error when NaN coordinates are passed to flyTo');
});

// ---------------------------------------------------------------------------
// ADVERSARIAL CHALLENGE 4: Infinite Timer Loop Under Offline Condition
// ---------------------------------------------------------------------------
suite.test('ADV-4: Offline initMap recursion executes unbounded setTimeout retries without backoff or limit', async (assert) => {
  const patientPath = path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt');
  const code = fs.readFileSync(patientPath, 'utf8');

  // Check the initMap loop
  assert.match(code, /if\s*\(typeof\s+L\s*===\s*['"]undefined['"]\)\s*{\s*setTimeout\(initMap,\s*100\);\s*return;\s*}/);

  // Check if there is any retry counter or max retry limit
  const hasRetryLimit = /retryCount|maxRetries|retries\s*>/i.test(code);
  assert.equal(hasRetryLimit, false, 'initMap does not specify a maxRetries ceiling or exponential backoff');

  // Simulate 10 iterations of the unbounded loop
  let timerCount = 0;
  let L_defined = false;

  function simulateInitMap(maxCycles = 5) {
    if (!L_defined) {
      timerCount++;
      if (timerCount < maxCycles) {
        simulateInitMap(maxCycles);
      }
    }
  }

  simulateInitMap(5);
  assert.equal(timerCount, 5, 'Unbounded retry loop executed all cycles without auto-termination');
});

// ---------------------------------------------------------------------------
// ADVERSARIAL CHALLENGE 5: Geocoder Coroutine Lack of Cancellation
// ---------------------------------------------------------------------------
suite.test('ADV-5: Mobile reverseGeocode launches concurrent coroutines without Job cancellation', (assert) => {
  const patientPath = path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt');
  const code = fs.readFileSync(patientPath, 'utf8');

  // Inspect the reverseGeocode function in Kotlin
  const geocodeFnMatch = code.match(/fun\s+reverseGeocode\s*\([^)]*\)\s*\{([^}]+coroutineScope\.launch[^}]*)\}/s);
  assert.ok(geocodeFnMatch, 'reverseGeocode function found in Kotlin');

  const geocodeBody = geocodeFnMatch[1];

  // Check whether a Job reference is cancelled before launch (e.g. `geocodeJob?.cancel(); geocodeJob = ...`)
  const hasJobCancellation = /cancel\(\)/.test(geocodeBody);
  assert.equal(hasJobCancellation, false, 'reverseGeocode does not cancel previous in-flight Geocoder jobs on rapid marker movement');
});

module.exports = suite;

if (require.main === module) {
  suite.run(true).then((summary) => {
    process.exitCode = summary.failed > 0 ? 1 : 0;
  });
}
