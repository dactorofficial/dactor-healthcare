package com.dactor.patient.ui.components

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import org.json.JSONObject
import java.util.Locale

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ClinicMapView(
    clinicName: String,
    clinicAddress: String,
    latitude: Double,
    longitude: Double,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val effectiveLat = if (latitude != 0.0) latitude else 27.7052
    val effectiveLng = if (longitude != 0.0) longitude else 85.3193

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        Icons.Default.Map,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        "Live Map & Clinic Location",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                ) {
                    Text(
                        "Live Map",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            // Interactive Map WebView Container (100% Self-Contained Slippy Tile Map Engine)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(210.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
            ) {
                val quotedName = JSONObject.quote(clinicName)
                val quotedAddr = JSONObject.quote(clinicAddress)

                AndroidView(
                    factory = { ctx ->
                        WebView(ctx).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.databaseEnabled = true
                            settings.allowFileAccess = false
                            settings.allowContentAccess = false
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            }
                            settings.cacheMode = WebSettings.LOAD_DEFAULT
                            settings.userAgentString = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 DactorApp/2.0"
                            webChromeClient = WebChromeClient()
                            webViewClient = object : WebViewClient() {
                                override fun onReceivedSslError(view: WebView?, handler: android.webkit.SslErrorHandler?, error: android.net.http.SslError?) {
                                    handler?.cancel()
                                }
                            }

                            val html = """
                                <!DOCTYPE html>
                                <html>
                                <head>
                                  <meta charset="utf-8" />
                                  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                                  <style>
                                    * { box-sizing: border-box; user-select: none; -webkit-user-select: none; }
                                    html, body {
                                      margin: 0; padding: 0; width: 100%; height: 100%;
                                      overflow: hidden; background: #e8f0f8;
                                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                      touch-action: none;
                                    }
                                    #mapViewport {
                                      position: relative; width: 100%; height: 100%;
                                      overflow: hidden; cursor: grab;
                                      background: linear-gradient(180deg, #e2eef8 0%, #d8e8f4 100%);
                                    }
                                    #gridCanvas {
                                      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                                      pointer-events: none; z-index: 1;
                                    }
                                    #tileLayer {
                                      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                                      z-index: 2; pointer-events: none;
                                    }
                                    .map-tile {
                                      position: absolute; width: 256px; height: 256px;
                                      border: none; pointer-events: none;
                                    }
                                    #pinOverlay {
                                      position: absolute; z-index: 10; pointer-events: none;
                                      transform: translate(-50%, -100%);
                                      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35));
                                    }
                                    #popupLabel {
                                      position: absolute; bottom: 48px; left: 50%;
                                      transform: translateX(-50%);
                                      background: rgba(255,255,255,0.96);
                                      border-radius: 8px; padding: 5px 10px;
                                      box-shadow: 0 3px 10px rgba(0,0,0,0.18);
                                      border: 1px solid #cbd5e1;
                                      white-space: nowrap; max-width: 220px;
                                      overflow: hidden; text-overflow: ellipsis;
                                      font-size: 11px; color: #0f172a; text-align: center;
                                    }
                                    .zoom-controls {
                                      position: absolute; right: 10px; bottom: 12px; z-index: 20;
                                      display: flex; flex-direction: column; gap: 5px;
                                    }
                                    .zoom-btn {
                                      width: 34px; height: 34px; border-radius: 8px;
                                      background: rgba(255,255,255,0.95); border: 1px solid #cbd5e1;
                                      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                                      font-size: 18px; font-weight: bold; color: #0f172a;
                                      display: flex; align-items: center; justify-content: center;
                                      cursor: pointer;
                                    }
                                  </style>
                                </head>
                                <body>
                                  <div id="mapViewport">
                                    <canvas id="gridCanvas"></canvas>
                                    <div id="tileLayer"></div>
                                    <div id="pinOverlay">
                                      <div id="popupLabel"></div>
                                      <svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M17 0C7.61 0 0 7.61 0 17c0 13.5 17 27 17 27s17-13.5 17-27C34 7.61 26.39 0 17 0z" fill="#0284C7"/>
                                        <circle cx="17" cy="17" r="7" fill="#FFFFFF"/>
                                        <circle cx="17" cy="17" r="3.5" fill="#0284C7"/>
                                      </svg>
                                    </div>
                                    <div class="zoom-controls">
                                      <button class="zoom-btn" id="btnZoomIn">+</button>
                                      <button class="zoom-btn" id="btnZoomOut">−</button>
                                    </div>
                                  </div>
                                  <script>
                                    (function() {
                                      var viewport = document.getElementById('mapViewport');
                                      var tileLayer = document.getElementById('tileLayer');
                                      var pinOverlay = document.getElementById('pinOverlay');
                                      var popupLabel = document.getElementById('popupLabel');
                                      var gridCanvas = document.getElementById('gridCanvas');
                                      var ctx = gridCanvas.getContext('2d');

                                      popupLabel.innerHTML = '<b>' + $quotedName + '</b><br><span style="color:#475569;font-size:10px;">' + $quotedAddr + '</span>';

                                      var zoom = 15;
                                      var centerLat = $effectiveLat;
                                      var centerLng = $effectiveLng;
                                      var pinLat = $effectiveLat;
                                      var pinLng = $effectiveLng;
                                      var tileCache = {};

                                      function lng2tileX(lng, z) {
                                        return ((lng + 180) / 360) * Math.pow(2, z);
                                      }
                                      function lat2tileY(lat, z) {
                                        var rad = lat * Math.PI / 180;
                                        return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z);
                                      }
                                      function tileX2lng(x, z) {
                                        return x / Math.pow(2, z) * 360 - 180;
                                      }
                                      function tileY2lat(y, z) {
                                        var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
                                        return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
                                      }

                                      function getTileUrls(z, x, y) {
                                        var maxTile = Math.pow(2, z);
                                        var wrappedX = ((x % maxTile) + maxTile) % maxTile;
                                        var sub = ['a', 'b', 'c'][Math.abs(wrappedX + y) % 3];
                                        return [
                                          'https://tile.openstreetmap.org/' + z + '/' + wrappedX + '/' + y + '.png',
                                          'https://' + sub + '.basemaps.cartocdn.com/rastertiles/voyager/' + z + '/' + wrappedX + '/' + y + '.png',
                                          'https://tile.openstreetmap.fr/hot/' + z + '/' + wrappedX + '/' + y + '.png'
                                        ];
                                      }

                                      function drawFallbackGrid(w, h, cx, cy) {
                                        if (gridCanvas.width !== w || gridCanvas.height !== h) {
                                          gridCanvas.width = w;
                                          gridCanvas.height = h;
                                        }
                                        ctx.clearRect(0, 0, w, h);
                                        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
                                        ctx.lineWidth = 1;
                                        var step = 64;
                                        var offX = (-(cx * 256) % step + step) % step;
                                        var offY = (-(cy * 256) % step + step) % step;
                                        for (var x = offX; x < w; x += step) {
                                          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                                        }
                                        for (var y = offY; y < h; y += step) {
                                          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
                                        }
                                      }

                                      function render() {
                                        var w = viewport.clientWidth || window.innerWidth || 320;
                                        var h = viewport.clientHeight || window.innerHeight || 200;
                                        var cx = lng2tileX(centerLng, zoom);
                                        var cy = lat2tileY(centerLat, zoom);

                                        drawFallbackGrid(w, h, cx, cy);

                                        var startX = Math.floor(cx - (w / 2) / 256) - 1;
                                        var endX = Math.ceil(cx + (w / 2) / 256) + 1;
                                        var startY = Math.floor(cy - (h / 2) / 256) - 1;
                                        var endY = Math.ceil(cy + (h / 2) / 256) + 1;
                                        var maxTile = Math.pow(2, zoom);

                                        var activeKeys = {};
                                        for (var tx = startX; tx <= endX; tx++) {
                                          for (var ty = startY; ty <= endY; ty++) {
                                            if (ty < 0 || ty >= maxTile) continue;
                                            var key = zoom + '_' + tx + '_' + ty;
                                            activeKeys[key] = true;
                                            var img = tileCache[key];
                                            if (!img) {
                                              img = document.createElement('img');
                                              img.className = 'map-tile';
                                              img.alt = '';
                                              var urls = getTileUrls(zoom, tx, ty);
                                              var urlIdx = 0;
                                              img.onerror = function() {
                                                urlIdx++;
                                                if (urlIdx < urls.length) {
                                                  this.src = urls[urlIdx];
                                                } else {
                                                  this.style.opacity = '0';
                                                }
                                              };
                                              img.onload = function() {
                                                this.style.opacity = '1';
                                              };
                                              img.src = urls[0];
                                              tileLayer.appendChild(img);
                                              tileCache[key] = img;
                                            }
                                            var px = Math.round((w / 2) + (tx - cx) * 256);
                                            var py = Math.round((h / 2) + (ty - cy) * 256);
                                            img.style.left = px + 'px';
                                            img.style.top = py + 'px';
                                          }
                                        }

                                        for (var k in tileCache) {
                                          if (!activeKeys[k]) {
                                            var oldImg = tileCache[k];
                                            if (oldImg && oldImg.parentNode) {
                                              oldImg.parentNode.removeChild(oldImg);
                                            }
                                            delete tileCache[k];
                                          }
                                        }

                                        var pinTileX = lng2tileX(pinLng, zoom);
                                        var pinTileY = lat2tileY(pinLat, zoom);
                                        var pinPx = (w / 2) + (pinTileX - cx) * 256;
                                        var pinPy = (h / 2) + (pinTileY - cy) * 256;
                                        pinOverlay.style.left = pinPx + 'px';
                                        pinOverlay.style.top = pinPy + 'px';
                                      }

                                      var isDragging = false;
                                      var lastX = 0, lastY = 0;

                                      function onStart(clientX, clientY) {
                                        isDragging = true;
                                        lastX = clientX;
                                        lastY = clientY;
                                      }
                                      function onMove(clientX, clientY) {
                                        if (!isDragging) return;
                                        var dx = clientX - lastX;
                                        var dy = clientY - lastY;
                                        lastX = clientX;
                                        lastY = clientY;
                                        var cx = lng2tileX(centerLng, zoom) - (dx / 256);
                                        var cy = lat2tileY(centerLat, zoom) - (dy / 256);
                                        centerLng = tileX2lng(cx, zoom);
                                        centerLat = Math.max(-85, Math.min(85, tileY2lat(cy, zoom)));
                                        render();
                                      }
                                      function onEnd() {
                                        isDragging = false;
                                      }

                                      viewport.addEventListener('mousedown', function(e) {
                                        if (e.target.tagName === 'BUTTON') return;
                                        onStart(e.clientX, e.clientY);
                                      });
                                      window.addEventListener('mousemove', function(e) { onMove(e.clientX, e.clientY); });
                                      window.addEventListener('mouseup', onEnd);

                                      var pinchDist = 0;
                                      var lastTap = 0;
                                      viewport.addEventListener('touchstart', function(e) {
                                        if (e.target.tagName === 'BUTTON') return;
                                        if (e.touches.length === 1) {
                                          pinchDist = 0;
                                          onStart(e.touches[0].clientX, e.touches[0].clientY);
                                        } else if (e.touches.length === 2) {
                                          isDragging = false;
                                          var dx = e.touches[0].clientX - e.touches[1].clientX;
                                          var dy = e.touches[0].clientY - e.touches[1].clientY;
                                          pinchDist = Math.sqrt(dx * dx + dy * dy);
                                        }
                                      }, { passive: true });
                                      viewport.addEventListener('touchmove', function(e) {
                                        if (e.touches.length === 1 && !pinchDist) {
                                          onMove(e.touches[0].clientX, e.touches[0].clientY);
                                        } else if (e.touches.length === 2) {
                                          var dx = e.touches[0].clientX - e.touches[1].clientX;
                                          var dy = e.touches[0].clientY - e.touches[1].clientY;
                                          var d = Math.sqrt(dx * dx + dy * dy);
                                          if (pinchDist > 0) {
                                            if (d - pinchDist > 40 && zoom < 19) {
                                              zoom++;
                                              pinchDist = d;
                                              render();
                                            } else if (pinchDist - d > 40 && zoom > 4) {
                                              zoom--;
                                              pinchDist = d;
                                              render();
                                            }
                                          } else {
                                            pinchDist = d;
                                          }
                                        }
                                      }, { passive: true });
                                      viewport.addEventListener('touchend', function(e) {
                                        pinchDist = 0;
                                        var now = Date.now();
                                        if (now - lastTap < 300 && zoom < 19) {
                                          zoom++;
                                          render();
                                        }
                                        lastTap = now;
                                        onEnd();
                                      }, { passive: true });

                                      document.getElementById('btnZoomIn').addEventListener('click', function(e) {
                                        e.stopPropagation();
                                        if (zoom < 19) { zoom++; render(); }
                                      });
                                      document.getElementById('btnZoomOut').addEventListener('click', function(e) {
                                        e.stopPropagation();
                                        if (zoom > 4) { zoom--; render(); }
                                      });

                                      window.updateClinicMarker = function(lat, lng) {
                                        centerLat = lat;
                                        centerLng = lng;
                                        pinLat = lat;
                                        pinLng = lng;
                                        render();
                                      };

                                      window.addEventListener('resize', render);
                                      setTimeout(render, 50);
                                      setTimeout(render, 250);
                                      setTimeout(render, 600);
                                      setTimeout(render, 1200);
                                      render();
                                    })();
                                  </script>
                                </body>
                                </html>
                            """.trimIndent()

                            loadDataWithBaseURL("https://www.openstreetmap.org", html, "text/html", "UTF-8", null)
                        }
                    },
                    update = { view ->
                        view.evaluateJavascript("if(window.updateClinicMarker) window.updateClinicMarker($effectiveLat, $effectiveLng);", null)
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }

            // Coordinates & Directions Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                        Text(
                            text = clinicAddress.ifBlank { "Kathmandu, Nepal" },
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1
                        )
                    }
                    Text(
                        text = "GPS: ${String.format(Locale.US, "%.4f", effectiveLat)}° N, ${String.format(Locale.US, "%.4f", effectiveLng)}° E",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                FilledTonalButton(
                    onClick = {
                        openExternalMapNavigation(context, effectiveLat, effectiveLng, clinicName)
                    },
                    shape = RoundedCornerShape(10.dp),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.height(34.dp)
                ) {
                    Icon(Icons.Default.Directions, contentDescription = null, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Directions", fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
            }
        }
    }
}

private fun openExternalMapNavigation(
    context: Context,
    lat: Double,
    lng: Double,
    label: String
) {
    try {
        val encodedLabel = Uri.encode(label)
        val geoUri = Uri.parse("geo:$lat,$lng?q=$lat,$lng($encodedLabel)")
        val mapIntent = Intent(Intent.ACTION_VIEW, geoUri)
        mapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(mapIntent)
    } catch (e: Exception) {
        try {
            val browserUri = Uri.parse("https://www.openstreetmap.org/?mlat=$lat&mlon=$lng#map=16/$lat/$lng")
            val browserIntent = Intent(Intent.ACTION_VIEW, browserUri)
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(browserIntent)
        } catch (ignored: Exception) {}
    }
}
