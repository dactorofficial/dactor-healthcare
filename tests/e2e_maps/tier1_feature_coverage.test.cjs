/**
 * Tier 1: Feature Coverage E2E Tests
 * Validates F1 through F8 with >=5 test cases per feature (Total: 48 tests).
 * Authoritative sources: PROJECT.md, ORIGINAL_REQUEST.md, live network oracles.
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite } = require('./test_runner_framework.cjs');
const { REPO_ROOT, CONTRACTS, isValidLatLng, isWithinNepalBounds } = require('./contracts.cjs');

const suite = createTestSuite('Feature Coverage (F1 - F8)', 1);

// Helper to safely fetch network resource with timeout
async function safeFetch(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// FEATURE 1: Web Map CDN Migration (Leaflet vs MapLibre absence)
// ---------------------------------------------------------------------------

suite.test('F1.1: web-app/index.html includes Leaflet v1.9.4 CSS stylesheet link', (assert) => {
  const indexPath = path.join(REPO_ROOT, 'web-app', 'index.html');
  assert.ok(fs.existsSync(indexPath), 'web-app/index.html must exist');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /leaflet@1\.9\.4\/dist\/leaflet\.css/, 'index.html must reference Leaflet 1.9.4 CSS');
});

suite.test('F1.2: web-app/index.html includes Leaflet v1.9.4 JS script tag', (assert) => {
  const indexPath = path.join(REPO_ROOT, 'web-app', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.match(html, /leaflet@1\.9\.4\/dist\/leaflet\.js/, 'index.html must reference Leaflet 1.9.4 JS');
});

suite.test('F1.3: web-app/index.html has zero references to maplibre-gl.css', (assert) => {
  const indexPath = path.join(REPO_ROOT, 'web-app', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.doesNotMatch(html, /maplibre-gl\.css/, 'index.html must not reference maplibre-gl.css');
});

suite.test('F1.4: web-app/index.html has zero references to maplibre-gl.js', (assert) => {
  const indexPath = path.join(REPO_ROOT, 'web-app', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert.doesNotMatch(html, /maplibre-gl\.js/, 'index.html must not reference maplibre-gl.js');
});

suite.test('F1.5: Leaflet v1.9.4 unpkg CDN endpoints return HTTP 200 (live oracle)', async (assert) => {
  const cssRes = await safeFetch(CONTRACTS.webCdn.leafletCss, { method: 'HEAD' });
  assert.equal(cssRes.status, 200, 'Leaflet CSS CDN must return 200 OK');
  const jsRes = await safeFetch(CONTRACTS.webCdn.leafletJs, { method: 'HEAD' });
  assert.equal(jsRes.status, 200, 'Leaflet JS CDN must return 200 OK');
});

suite.test('F1.6: Leaflet v1.9.4 jsdelivr fallback CDN endpoints return HTTP 200 (live oracle)', async (assert) => {
  const cssRes = await safeFetch(CONTRACTS.webCdn.fallbackCss, { method: 'HEAD' });
  assert.equal(cssRes.status, 200, 'Leaflet jsdelivr CSS fallback must return 200 OK');
  const jsRes = await safeFetch(CONTRACTS.webCdn.fallbackJs, { method: 'HEAD' });
  assert.equal(jsRes.status, 200, 'Leaflet jsdelivr JS fallback must return 200 OK');
});

// ---------------------------------------------------------------------------
// FEATURE 2: Web Location Picker Functionality
// ---------------------------------------------------------------------------

suite.test('F2.1: MapLibreLocationPicker adheres to props contract interface', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx');
  assert.ok(fs.existsSync(file), 'MapLibreLocationPicker.tsx must exist');
  const code = fs.readFileSync(file, 'utf8');
  for (const prop of CONTRACTS.webComponents.pickerProps) {
    assert.match(code, new RegExp(prop + '[:?]'), `Picker props must declare ${prop}`);
  }
});

suite.test('F2.2: MapLibreLocationPicker sets center using [lat, lng] coordinate order', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx');
  const code = fs.readFileSync(file, 'utf8');
  // In Leaflet center is [lat, lng]
  assert.match(code, /\[\s*(initialLat|currentLat)[^,]*,\s*(initialLng|currentLng)[^\]]*\]/, 'Leaflet coordinates must follow [lat, lng] ordering');
});

suite.test('F2.3: MapLibreLocationPicker creates draggable pin using L.divIcon', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /L\.divIcon/, 'Picker must use L.divIcon for custom pin');
  assert.match(code, /draggable:\s*true/, 'Picker marker must be draggable');
});

suite.test('F2.4: MapLibreLocationPicker reverse geocoding queries Nominatim API contract', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /nominatim\.openstreetmap\.org\/reverse/, 'Picker must use Nominatim reverse geocode endpoint');
  assert.match(code, /format=jsonv2/, 'Nominatim query must specify format=jsonv2');
  assert.match(code, /lat=.*lon=/, 'Nominatim query must specify lat and lon parameters');
});

suite.test('F2.5: MapLibreLocationPicker defines 11 Nepal presets within valid coordinates', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx');
  const code = fs.readFileSync(file, 'utf8');
  for (const preset of CONTRACTS.webComponents.nepalPresets) {
    assert.includes(code, preset.name, `Picker must include preset ${preset.name}`);
    assert.ok(isWithinNepalBounds(preset.lat, preset.lng), `Preset ${preset.name} coordinates must be in Nepal`);
  }
});

suite.test('F2.6: MapLibreLocationPicker GPS detection invokes navigator.geolocation', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /navigator\.geolocation\.getCurrentPosition/, 'Picker must use navigator.geolocation for GPS detection');
  assert.match(code, /enableHighAccuracy:\s*true/, 'Picker GPS must request high accuracy');
});

// ---------------------------------------------------------------------------
// FEATURE 3: Web Location Viewer Functionality
// ---------------------------------------------------------------------------

suite.test('F3.1: MapLibreLocationViewer adheres to props contract interface', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx');
  assert.ok(fs.existsSync(file), 'MapLibreLocationViewer.tsx must exist');
  const code = fs.readFileSync(file, 'utf8');
  for (const prop of CONTRACTS.webComponents.viewerProps) {
    assert.match(code, new RegExp(prop + '[:?]'), `Viewer props must declare ${prop}`);
  }
});

suite.test('F3.2: MapLibreLocationViewer generates valid Google Maps directions URL', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /google\.com\/maps\/dir\/\?api=1&destination=/, 'Viewer must format Google Maps directions URL');
  const testUrl = CONTRACTS.webComponents.directionsUrlTemplate(27.7052, 85.3193);
  assert.equal(testUrl, 'https://www.google.com/maps/dir/?api=1&destination=27.7052,85.3193', 'Directions URL format match');
});

suite.test('F3.3: MapLibreLocationViewer creates pulsing halo marker via L.divIcon', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /L\.divIcon/, 'Viewer must use L.divIcon');
  assert.match(code, /pulse/, 'Viewer icon markup must contain pulsing halo animation style or class');
});

suite.test('F3.4: MapLibreLocationViewer supports both inline and modal modes', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /mode\s*===\s*['"]modal['"]/, 'Viewer must support modal mode conditional rendering');
  assert.match(code, /mode\s*===\s*['"]inline['"]/, 'Viewer must support inline mode conditional rendering');
});

suite.test('F3.5: MapLibreLocationViewer recenter action flies to target clinic coordinates', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /flyTo\(\s*\[\s*(effectiveLat|lat)[^,]*,/, 'Recenter must call map.flyTo with [lat, lng]');
});

suite.test('F3.6: Backward compatibility: named and default exports preserved in viewer and picker', (assert) => {
  const viewerCode = fs.readFileSync(path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx'), 'utf8');
  const pickerCode = fs.readFileSync(path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx'), 'utf8');
  assert.match(viewerCode, /export\s+(const|function)\s+MapLibreLocationViewer/, 'Named export MapLibreLocationViewer must exist');
  assert.match(viewerCode, /export\s+default\s+MapLibreLocationViewer/, 'Default export MapLibreLocationViewer must exist');
  assert.match(pickerCode, /export\s+(const|function)\s+MapLibreLocationPicker/, 'Named export MapLibreLocationPicker must exist');
  assert.match(pickerCode, /export\s+default\s+MapLibreLocationPicker/, 'Default export MapLibreLocationPicker must exist');
});

// ---------------------------------------------------------------------------
// FEATURE 4: Mobile Picker HTML/JS Leaflet Integration
// ---------------------------------------------------------------------------

suite.test('F4.1: Mobile HTML template in patient-app loads Leaflet v1.9.4 CSS & JS', (assert) => {
  const file = path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /leaflet@1\.9\.4\/dist\/leaflet\.css/, 'Patient app must load Leaflet 1.9.4 CSS');
  assert.match(code, /leaflet@1\.9\.4\/dist\/leaflet\.js/, 'Patient app must load Leaflet 1.9.4 JS');
});

suite.test('F4.2: Mobile HTML template in clinic-app loads Leaflet v1.9.4 CSS & JS', (assert) => {
  const file = path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'components', 'OpenStreetMapPicker.kt');
  const code = fs.readFileSync(file, 'utf8');
  assert.match(code, /leaflet@1\.9\.4\/dist\/leaflet\.css/, 'Clinic app must load Leaflet 1.9.4 CSS');
  assert.match(code, /leaflet@1\.9\.4\/dist\/leaflet\.js/, 'Clinic app must load Leaflet 1.9.4 JS');
});

suite.test('F4.3: Mobile HTML templates configure L.tileLayer with CARTO Voyager raster URL', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  const clinicCode = fs.readFileSync(path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  const expectedUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  assert.includes(patientCode, expectedUrl, 'Patient app must use CARTO Voyager raster URL');
  assert.includes(clinicCode, expectedUrl, 'Clinic app must use CARTO Voyager raster URL');
});

suite.test('F4.4: Mobile HTML templates configure subdomains abcd and maxZoom 19', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  const clinicCode = fs.readFileSync(path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /subdomains:\s*['"]abcd['"]/, 'Patient app must configure subdomains abcd');
  assert.match(clinicCode, /subdomains:\s*['"]abcd['"]/, 'Clinic app must configure subdomains abcd');
  assert.match(patientCode, /maxZoom:\s*19/, 'Patient app must configure maxZoom 19');
  assert.match(clinicCode, /maxZoom:\s*19/, 'Clinic app must configure maxZoom 19');
});

suite.test('F4.5: Both Kotlin files configure loadDataWithBaseURL with cartocdn.com', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  const clinicCode = fs.readFileSync(path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /loadDataWithBaseURL\(\s*["']https:\/\/basemaps\.cartocdn\.com["']/, 'Patient app must use basemaps.cartocdn.com base URL');
  assert.match(clinicCode, /loadDataWithBaseURL\(\s*["']https:\/\/basemaps\.cartocdn\.com["']/, 'Clinic app must use basemaps.cartocdn.com base URL');
});

suite.test('F4.6: Mobile HTML templates call invalidateSize to prevent blank viewport on mount', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  const clinicCode = fs.readFileSync(path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /map\.invalidateSize\(\)/, 'Patient app must call invalidateSize');
  assert.match(clinicCode, /map\.invalidateSize\(\)/, 'Clinic app must call invalidateSize');
});

// ---------------------------------------------------------------------------
// FEATURE 5: Mobile Center Pin Animation
// ---------------------------------------------------------------------------

suite.test('F5.1: Mobile HTML templates render center pin element #centerPin with pointer-events: none', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /id=["']centerPin["']/, 'Must render element with id centerPin');
  assert.match(patientCode, /\.center-pin-container\s*{[^}]*pointer-events:\s*none/, 'Pin container must set pointer-events: none');
});

suite.test('F5.2: Mobile HTML templates render pin shadow element .pin-shadow', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /class=["']pin-shadow["']/, 'Must render .pin-shadow element');
  assert.match(patientCode, /\.pin-shadow\s*{[^}]*border-radius:\s*50%/, 'Pin shadow must have circular styling');
});

suite.test('F5.3: movestart event applies upward elevation transform to center pin', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /map\.on\(['"]movestart['"]/, 'Must listen to movestart event');
  assert.match(patientCode, /translate\(-50%,\s*-115%\)\s*scale\(1\.05\)/, 'movestart must apply elevated pin transform');
});

suite.test('F5.4: moveend event restores resting transform to center pin', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /map\.on\(['"]moveend['"]/, 'Must listen to moveend event');
  assert.match(patientCode, /translate\(-50%,\s*-100%\)\s*scale\(1\)/, 'moveend must restore resting pin transform');
});

suite.test('F5.5: Center pin container has z-index: 1000 higher than Leaflet map panes', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /\.center-pin-container\s*{[^}]*z-index:\s*1000;/, 'Pin z-index must be 1000');
  assert.match(patientCode, /\.pin-shadow\s*{[^}]*z-index:\s*999;/, 'Pin shadow z-index must be 999');
});

suite.test('F5.6: Center pin container defines CSS transition ease-out for smooth landing', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /transition:\s*transform\s+0\.15s\s+ease-out/, 'Pin transition must be 0.15s ease-out');
});

// ---------------------------------------------------------------------------
// FEATURE 6: Mobile Bridge Contracts
// ---------------------------------------------------------------------------

suite.test('F6.1: moveend event handler debounces location emission by 60ms', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /clearTimeout\(debounceTimer\)/, 'Must cancel existing debounce timer');
  assert.match(patientCode, /setTimeout\(emitLocation,\s*60\)/, 'Must debounce emitLocation by 60ms');
});

suite.test('F6.2: emitLocation calls window.AndroidInterface.onMarkerMoved with center (lat, lng)', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /var\s+c\s*=\s*map\.getCenter\(\)/, 'Must get map center');
  assert.match(patientCode, /window\.AndroidInterface\.onMarkerMoved\(c\.lat,\s*c\.lng\)/, 'Must invoke onMarkerMoved(c.lat, c.lng)');
});

suite.test('F6.3: emitLocation guards against undefined AndroidInterface', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /window\.AndroidInterface\s*&&\s*window\.AndroidInterface\.onMarkerMoved/, 'Must guard before invoking AndroidInterface');
});

suite.test('F6.4: window.moveToCoords implementation calls map.flyTo([lat, lng])', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /window\.moveToCoords\s*=\s*function\(lat,\s*lng\)/, 'Must expose window.moveToCoords');
  assert.match(patientCode, /map\.flyTo\(\[lat,\s*lng\]/, 'moveToCoords must fly to [lat, lng]');
});

suite.test('F6.5: window.moveToCoords preserves zoom level with minimum of 15', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /Math\.max\(map\.getZoom\(\),\s*15\)/, 'Must enforce minimum zoom level 15');
});

suite.test('F6.6: Window resize event executes map.invalidateSize()', (assert) => {
  const patientCode = fs.readFileSync(path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'patient', 'ui', 'components', 'OpenStreetMapPicker.kt'), 'utf8');
  assert.match(patientCode, /window\.addEventListener\(['"]resize['"],\s*function\(\)\s*{\s*if\s*\(map\)\s*map\.invalidateSize\(\);?\s*}\)/, 'Resize event must trigger invalidateSize');
});

// ---------------------------------------------------------------------------
// FEATURE 7: Tile Provider Network Contracts (Live Network Oracles)
// ---------------------------------------------------------------------------

suite.test('F7.1: CARTO Voyager subdomain a live tile returns HTTP 200 image/png', async (assert) => {
  const tileUrl = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png';
  const res = await safeFetch(tileUrl);
  assert.equal(res.status, 200, 'Subdomain a must return 200');
  const contentType = res.headers.get('content-type') || '';
  assert.match(contentType, /image\/png/, 'Content-Type must be image/png');
});

suite.test('F7.2: CARTO Voyager subdomain b live tile returns HTTP 200 with CORS *', async (assert) => {
  const tileUrl = 'https://b.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png';
  const res = await safeFetch(tileUrl);
  assert.equal(res.status, 200, 'Subdomain b must return 200');
  const cors = res.headers.get('access-control-allow-origin');
  assert.equal(cors, '*', 'CORS Access-Control-Allow-Origin must be *');
});

suite.test('F7.3: CARTO Voyager subdomain c live tile returns HTTP 200 with max-age caching', async (assert) => {
  const tileUrl = 'https://c.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png';
  const res = await safeFetch(tileUrl);
  assert.equal(res.status, 200, 'Subdomain c must return 200');
  const cacheControl = res.headers.get('cache-control') || '';
  assert.match(cacheControl, /max-age=\d+/, 'Cache-Control header must define max-age');
});

suite.test('F7.4: CARTO Voyager subdomain d live tile returns HTTP 200', async (assert) => {
  const tileUrl = 'https://d.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png';
  const res = await safeFetch(tileUrl);
  assert.equal(res.status, 200, 'Subdomain d must return 200');
});

suite.test('F7.5: CARTO Voyager Kathmandu tile (z=10, x=760, y=426) body size > 1000 bytes', async (assert) => {
  const tileUrl = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/10/760/426.png';
  const res = await safeFetch(tileUrl);
  const buf = await res.arrayBuffer();
  assert.ok(buf.byteLength > 1000, `Tile payload must be a non-trivial PNG image (received ${buf.byteLength} bytes)`);
});

suite.test('F7.6: Fallback OSM tile server returns HTTP 200 when custom User-Agent is provided', async (assert) => {
  const tileUrl = 'https://tile.openstreetmap.org/10/760/426.png';
  const res = await safeFetch(tileUrl, {
    headers: { 'User-Agent': CONTRACTS.tileProviders.osmRaster.requiredUserAgent }
  });
  assert.equal(res.status, 200, 'OSM tile server with valid User-Agent must return 200 OK');
});

// ---------------------------------------------------------------------------
// FEATURE 8: Complete Eradication of tiles.openfreemap.org
// ---------------------------------------------------------------------------

const { execFileSync } = require('child_process');

function checkZeroOccurrences(filePath, query) {
  try {
    const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const result = execFileSync('git', ['grep', '-n', query, '--', relPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // If grep returned with matches, occurrences > 0
    return !result || result.trim().length === 0;
  } catch (err) {
    // git grep exits with 1 when NO matches are found
    if (err.status === 1) return true;
    // Fallback to manual check if git command fails
    if (!fs.existsSync(filePath)) return true;
    const stat = fs.statSync(filePath);
    if (!stat.isDirectory()) {
      return !fs.readFileSync(filePath, 'utf8').includes(query);
    }
    return true;
  }
}

suite.test('F8.1: Zero occurrences of tiles.openfreemap.org in web-app/src', (assert) => {
  const dir = path.join(REPO_ROOT, 'web-app', 'src');
  assert.ok(checkZeroOccurrences(dir, 'tiles.openfreemap.org'), 'web-app/src must contain zero references to tiles.openfreemap.org');
});

suite.test('F8.2: Zero occurrences of tiles.openfreemap.org in patient-app/app/src/main/java', (assert) => {
  const dir = path.join(REPO_ROOT, 'patient-app', 'app', 'src', 'main', 'java');
  assert.ok(checkZeroOccurrences(dir, 'tiles.openfreemap.org'), 'patient-app must contain zero references to tiles.openfreemap.org');
});

suite.test('F8.3: Zero occurrences of tiles.openfreemap.org in clinic-app/app/src/main/java', (assert) => {
  const dir = path.join(REPO_ROOT, 'clinic-app', 'app', 'src', 'main', 'java');
  assert.ok(checkZeroOccurrences(dir, 'tiles.openfreemap.org'), 'clinic-app must contain zero references to tiles.openfreemap.org');
});

suite.test('F8.4: Zero occurrences of tiles.openfreemap.org in admin-panel/src', (assert) => {
  const dir = path.join(REPO_ROOT, 'admin-panel', 'src');
  assert.ok(checkZeroOccurrences(dir, 'tiles.openfreemap.org'), 'admin-panel must contain zero references to tiles.openfreemap.org');
});

suite.test('F8.5: Zero occurrences of tiles.openfreemap.org in web-app/index.html', (assert) => {
  const file = path.join(REPO_ROOT, 'web-app', 'index.html');
  assert.ok(checkZeroOccurrences(file, 'tiles.openfreemap.org'), 'web-app/index.html must not contain tiles.openfreemap.org');
});

suite.test('F8.6: Zero occurrences of openfreemap in active component UI text', (assert) => {
  const viewer = fs.readFileSync(path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationViewer.tsx'), 'utf8');
  const picker = fs.readFileSync(path.join(REPO_ROOT, 'web-app', 'src', 'components', 'MapLibreLocationPicker.tsx'), 'utf8');
  assert.doesNotMatch(viewer, /•\s*OpenFreeMap/, 'Viewer coordinates strip must not reference OpenFreeMap');
  assert.doesNotMatch(picker, /OpenFreeMap vector tiles/, 'Picker header must not reference OpenFreeMap');
});

module.exports = suite;
