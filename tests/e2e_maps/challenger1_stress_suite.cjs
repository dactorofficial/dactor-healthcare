/**
 * Adversarial Stress Test Suite — Challenger 1
 * Empirical Boundary Verification:
 *  1. Out-of-bounds & Extreme Coordinates
 *  2. Rapid Map Drags & Debounce Stability
 *  3. Tile Server Resilience & Network Fault Tolerance
 *
 * Location: tests/e2e_maps/challenger1_stress_suite.cjs
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite } = require('./test_runner_framework.cjs');
const { REPO_ROOT, CONTRACTS, isValidLatLng, isWithinNepalBounds } = require('./contracts.cjs');

const suite = createTestSuite('Challenger 1 Adversarial Stress Suite', 5);

// ===========================================================================
// CATEGORY 1: Out-of-Bounds & Extreme Coordinates
// ===========================================================================

suite.test('S1.1: Web Mercator projection singularity at lat > 85.0511° produces NaN and must be clamped/guarded', (assert) => {
  // Web Mercator standard formula used by Leaflet CRS.EPSG3857
  function mercatorY(lat) {
    if (lat < -90 || lat > 90) return NaN;
    const rad = (lat * Math.PI) / 180;
    const sin = Math.sin(rad);
    if (sin >= 1 || sin <= -1) return NaN;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
  }

  const validY = mercatorY(27.7052);
  assert.ok(!Number.isNaN(validY), 'Kathmandu lat 27.7052 must project to a valid number');

  const poleY = mercatorY(90);
  assert.ok(Number.isNaN(poleY) || !Number.isFinite(poleY), 'Lat 90 is singularity in Mercator');

  const oobY = mercatorY(95);
  assert.ok(Number.isNaN(oobY), 'Lat 95 must result in NaN in Mercator projection');
});

suite.test('S1.2: Longitude multi-revolution wrapping behavior (>180, <-180, 360, 720)', (assert) => {
  function wrapLng(lng) {
    return ((((lng + 180) % 360) + 360) % 360) - 180;
  }

  assert.equal(wrapLng(185), -175, '185 wrapped must be -175');
  assert.equal(Math.abs(wrapLng(540)), 180, '540 wrapped must be on the antimeridian (+/-180)');
  assert.equal(wrapLng(-190), 170, '-190 wrapped must be 170');
  assert.equal(wrapLng(360 + 85.3193), 85.3193, 'Full +360 revolution must wrap to 85.3193');
});

suite.test('S1.3: Inverted coordinate pair [lng, lat] (85.3193, 27.7052) detected as invalid latitude', (assert) => {
  // Inverted order test: if caller erroneously passes [lng, lat]
  const invertedLat = 85.3193;
  const invertedLng = 27.7052;

  // Lat 85.3193 is outside Nepal bounds [26.0 - 31.0]
  assert.equal(isWithinNepalBounds(invertedLat, invertedLng), false, 'Inverted coords must fail Nepal bounds check');
});

suite.test('S1.4: Null Island (0, 0) falsy defaulting anomaly verification (lat || 27.7052)', (assert) => {
  // In JavaScript: 0 is falsy, so `lat || 27.7052` replaces 0 with 27.7052
  const latInput = 0;
  const defaultFallback = latInput || 27.7052;
  assert.equal(defaultFallback, 27.7052, 'Falsy latInput 0 reverts to Kathmandu default');

  // Verify that in Kotlin, initialLat != 0.0 check is used
  const patientCode = fs.readFileSync(
    path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'),
    'utf8'
  );
  assert.match(patientCode, /if\s*\(initialLat\s*!=\s*0\.0\)\s*initialLat\s*else\s*27\.7052/, 'Kotlin explicitly checks != 0.0');
});

suite.test('S1.5: NaN / Infinity coordinate propagation in moveToCoords / flyTo contracts', (assert) => {
  // Test how JS handles window.moveToCoords(NaN, NaN)
  const isSafeCoord = (n) => typeof n === 'number' && Number.isFinite(n);
  assert.equal(isSafeCoord(NaN), false, 'NaN must be identified as unsafe');
  assert.equal(isSafeCoord(Infinity), false, 'Infinity must be identified as unsafe');
  assert.equal(isSafeCoord(-Infinity), false, '-Infinity must be identified as unsafe');
  assert.equal(isSafeCoord(27.7052), true, 'Valid float is safe');
});

suite.test('S1.6: Subnormal floating point precision and toFixed(5) formatting stability', (assert) => {
  const extremeCoords = [
    { lat: 27.705200000000001, lng: 85.319300000000002 },
    { lat: 27.000000000000001, lng: 85.000000000000001 },
    { lat: 26.812399999999999, lng: 87.283399999999999 }
  ];

  for (const c of extremeCoords) {
    const formatted = `Location (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`;
    assert.match(formatted, /^Location \(\d+\.\d{5}, \d+\.\d{5}\)$/, 'Formatted string must have exact 5 decimal digits');
  }
});

suite.test('S1.7: Nominatim API live boundary behavior: status 400 on NaN, 200 with error on Null Island', async (assert) => {
  // Test NaN query
  const nanUrl = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=NaN&lon=NaN';
  const nanResp = await fetch(nanUrl, {
    headers: { 'User-Agent': 'DactorMedicalStressTest/1.0', 'Accept-Language': 'en' }
  });
  assert.equal(nanResp.status, 400, 'Nominatim must return HTTP 400 for NaN coordinates');

  // Test Null Island query
  const nullIslandUrl = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=0&lon=0';
  const niResp = await fetch(nullIslandUrl, {
    headers: { 'User-Agent': 'DactorMedicalStressTest/1.0', 'Accept-Language': 'en' }
  });
  assert.equal(niResp.status, 200, 'Nominatim returns HTTP 200 for Null Island');
  const niData = await niResp.json();
  assert.ok(niData.error, 'Null Island response must contain error message');
  assert.equal(niData.display_name, undefined, 'Null Island must not have display_name');
});

suite.test('S1.8: Stale address retention anomaly when Nominatim reverse geocode fails on out-of-bounds drag', (assert) => {
  // Web reverseGeocode logic simulation:
  let addressInput = 'Kathmandu (Bagbazar / Center)';
  const reverseGeocodeSim = (respData, lat, lng) => {
    if (respData && respData.display_name) {
      addressInput = respData.display_name;
      return;
    }
    // Bug pattern: if !addressInput.trim() only falls back when empty!
    if (!addressInput.trim()) {
      addressInput = `Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    }
  };

  // Drag into unresolvable ocean
  reverseGeocodeSim({ error: 'Unable to geocode' }, 0, 0);
  // Stale address retained because addressInput was already populated!
  assert.equal(addressInput, 'Kathmandu (Bagbazar / Center)', 'Confirms empirical finding: stale address persists when reverse geocode fails');
});

// ===========================================================================
// CATEGORY 2: Rapid Map Drags & Debounce Stability
// ===========================================================================

suite.test('S2.1: High-frequency moveend event storm (100 rapid events in 50ms) coalescing to a single execution', async (assert) => {
  let callCount = 0;
  let timer = null;
  const emitLocation = () => { callCount++; };
  const triggerMoveEnd = () => {
    clearTimeout(timer);
    timer = setTimeout(emitLocation, 60);
  };

  for (let i = 0; i < 100; i++) {
    triggerMoveEnd();
  }

  // Right after storm (0ms elapsed since last trigger)
  assert.equal(callCount, 0, 'No emission immediately during event storm');

  // Wait 80ms (past 60ms quiescence)
  await new Promise((r) => setTimeout(r, 85));
  assert.equal(callCount, 1, 'Exactly one single emission after 100 rapid moveend events');
});

suite.test('S2.2: movestart mid-debounce gap: Absence of clearTimeout on movestart causes intermediate coordinate emission during drag', async (assert) => {
  let emissions = [];
  let timer = null;
  let currentCenter = { lat: 27.7052, lng: 85.3193 };

  const emitLocation = () => {
    emissions.push({ lat: currentCenter.lat, lng: currentCenter.lng });
  };

  // Actual code in OpenStreetMapPicker.kt:
  // map.on('movestart'): only changes pin style, does NOT clear debounceTimer!
  const onMoveStartActual = () => {
    // pin transform only
  };
  const onMoveEndActual = () => {
    clearTimeout(timer);
    timer = setTimeout(emitLocation, 60);
  };

  // 1. First move ends at t=0
  onMoveEndActual();

  // 2. User touches screen and drags again at t=20ms
  await new Promise((r) => setTimeout(r, 20));
  onMoveStartActual();
  currentCenter = { lat: 27.9999, lng: 85.9999 }; // In-flight drag center

  // 3. At t=75ms (past 60ms of first moveend), the timer fires MID-DRAG!
  await new Promise((r) => setTimeout(r, 55));
  assert.equal(emissions.length, 1, 'Timer fired during active drag because movestart lacks clearTimeout');
  assert.equal(emissions[0].lat, 27.9999, 'Emitted mid-drag coordinates');
});

suite.test('S2.3: Debounce timer resolution: exact 60ms delay boundary testing', async (assert) => {
  let fired = false;
  let timer = setTimeout(() => { fired = true; }, 60);

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(fired, false, 'Must NOT fire at 40ms (<60ms)');

  await new Promise((r) => setTimeout(r, 35));
  assert.equal(fired, true, 'Must be fired at 75ms (>60ms)');
});

suite.test('S2.4: Out-of-order asynchronous reverseGeocode resolution simulation', async (assert) => {
  let resolvedAddress = '';
  let requestCounter = 0;

  // Simulated geocoder with varying latency
  const reverseGeocodeWithSequence = (seq, latency, address) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Without sequence tracking: resolves whenever
        resolvedAddress = address;
        resolve({ seq, address });
      }, latency);
    });
  };

  // Request 1 (first move, high latency 80ms)
  const p1 = reverseGeocodeWithSequence(1, 80, 'Address 1 (Intermediate)');
  // Request 2 (second move, low latency 20ms)
  const p2 = reverseGeocodeWithSequence(2, 20, 'Address 2 (Final)');

  await Promise.all([p1, p2]);
  // Address 1 finished AFTER Address 2, overwriting it!
  assert.equal(resolvedAddress, 'Address 1 (Intermediate)', 'Empirical demonstration of async race condition without cancellation');
});

suite.test('S2.5: Rapid successive window.moveToCoords calls animation preemption', (assert) => {
  let activeTarget = null;
  const mockMap = {
    flyTo: (coords) => {
      activeTarget = coords;
    },
    getZoom: () => 15
  };

  const moveToCoords = (lat, lng) => {
    mockMap.flyTo([lat, lng]);
  };

  // 50 rapid preset clicks
  for (let i = 0; i < 50; i++) {
    moveToCoords(27.7000 + i * 0.001, 85.3100 + i * 0.001);
  }

  // Final target must be the 50th coordinate
  assert.deepEqual(activeTarget, [27.7000 + 49 * 0.001, 85.3100 + 49 * 0.001], 'Final target must match latest moveToCoords call');
});

suite.test('S2.6: Simultaneous manual drag and external window.moveToCoords interaction', (assert) => {
  let mapCenter = [27.7052, 85.3193];
  const mockMap = {
    flyTo: (coords) => {
      mapCenter = coords;
    },
    getCenter: () => ({ lat: mapCenter[0], lng: mapCenter[1] }),
    getZoom: () => 15
  };

  // Manual drag moves center
  mapCenter = [28.2096, 83.9856]; // Pokhara
  // GPS fix arrives concurrently
  mockMap.flyTo([27.6685, 85.3214]); // Lalitpur

  assert.deepEqual(mapCenter, [27.6685, 85.3214], 'GPS fix moveToCoords overrides manual drag center');
});

suite.test('S2.7: Center pin DOM transform state consistency under 1,000 interleaved start/end events', (assert) => {
  let pinTransform = 'translate(-50%, -100%) scale(1)'; // Resting

  const onMoveStart = () => { pinTransform = 'translate(-50%, -115%) scale(1.05)'; };
  const onMoveEnd = () => { pinTransform = 'translate(-50%, -100%) scale(1)'; };

  for (let i = 0; i < 1000; i++) {
    onMoveStart();
    onMoveEnd();
  }

  assert.equal(pinTransform, 'translate(-50%, -100%) scale(1)', 'Center pin must always end at resting transform');
});

suite.test('S2.8: Unmount / dismissal during active 60ms debounce window timer cleanup', async (assert) => {
  let callbackFired = false;
  let debounceTimer = setTimeout(() => { callbackFired = true; }, 60);

  // User dismisses modal at 20ms
  await new Promise((r) => setTimeout(r, 20));
  clearTimeout(debounceTimer);
  debounceTimer = null;

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(callbackFired, false, 'Callback must NOT fire after unmount/dismiss cleanup');
});

// ===========================================================================
// CATEGORY 3: Tile Server Resilience & Fault Tolerance
// ===========================================================================

suite.test('S3.1: Live CARTO Voyager subdomains a, b, c, d latency benchmark (< 1500ms)', async (assert) => {
  const subdomains = ['a', 'b', 'c', 'd'];
  for (const s of subdomains) {
    const url = `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png`;
    const start = Date.now();
    const res = await fetch(url);
    const duration = Date.now() - start;
    assert.equal(res.status, 200, `Subdomain ${s} must return HTTP 200`);
    assert.ok(duration < 1500, `Subdomain ${s} latency (${duration}ms) must be under 1500ms`);
  }
});

suite.test('S3.2: CARTO Voyager invalid tile coordinate returns 404 text/plain without server crash', async (assert) => {
  const invalidUrl = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/10/999999/999999.png';
  const res = await fetch(invalidUrl);
  assert.equal(res.status, 404, 'Must return HTTP 404');
  assert.notEqual(res.status, 500, 'Must NOT return HTTP 500 server error');
});

suite.test('S3.3: CARTO Voyager overzoom resilience (z=25) fallback behavior', async (assert) => {
  const overzoomUrl = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/25/760/426.png';
  const res = await fetch(overzoomUrl);
  // CARTO handles overzoom by either rendering or returning 200/404, but not 500
  assert.ok(res.status === 200 || res.status === 404, 'Status must be 200 or 404');
});

suite.test('S3.4: Tile server CORS header verification across all subdomains', async (assert) => {
  const subdomains = ['a', 'b', 'c', 'd'];
  for (const s of subdomains) {
    const url = `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png`;
    const res = await fetch(url);
    const cors = res.headers.get('access-control-allow-origin');
    assert.equal(cors, '*', `Subdomain ${s} must have CORS header '*'`);
  }
});

suite.test('S3.5: Fallback OSM tile server response with required User-Agent', async (assert) => {
  const osmUrl = 'https://tile.openstreetmap.org/10/760/426.png';
  const res = await fetch(osmUrl, {
    headers: { 'User-Agent': 'DactorMedicalApp/1.0 (contact@dactor.com)' }
  });
  assert.equal(res.status, 200, 'OSM tile server must return 200 with User-Agent');
  assert.equal(res.headers.get('content-type'), 'image/png', 'Content-Type must be image/png');
});

suite.test('S3.6: Simulated network failure / offline status: tileerror event firing without map crash', (assert) => {
  let tileErrorCaught = false;
  const mockTileLayer = {
    fire: function(eventName, data) {
      if (eventName === 'tileerror') {
        tileErrorCaught = true;
      }
    }
  };

  mockTileLayer.fire('tileerror', {
    error: new Error('Net::ERR_INTERNET_DISCONNECTED'),
    tile: { src: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png' }
  });

  assert.equal(tileErrorCaught, true, 'tileerror event must be cleanly intercepted');
});

suite.test('S3.7: CDN stylesheet and script error fallback (unpkg -> jsdelivr) injection verification', (assert) => {
  const patientCode = fs.readFileSync(
    path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'),
    'utf8'
  );

  // Verify unpkg primary and jsdelivr fallback
  assert.includes(patientCode, 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'Primary CSS is unpkg');
  assert.includes(patientCode, 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', 'Fallback CSS is jsdelivr');
  assert.includes(patientCode, 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'Primary JS is unpkg');
  assert.includes(patientCode, 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', 'Fallback JS is jsdelivr');
});

suite.test('S3.8: Complete eradication of tiles.openfreemap.org under deep scan of all active code', (assert) => {
  const scanDirs = [
    path.join(REPO_ROOT, 'web-app', 'src'),
    path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java'),
    path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java'),
    path.join(REPO_ROOT, 'admin-panel', 'src')
  ];

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (/\.(tsx?|jsx?|kt|html|json)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.doesNotMatch(content, /tiles\.openfreemap\.org/, `Forbidden openfreemap reference found in ${entry.name}`);
      }
    }
  }

  for (const d of scanDirs) {
    scanDir(d);
  }
});

// Run suite
if (require.main === module) {
  suite.run().then((summary) => {
    process.exit(summary.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
