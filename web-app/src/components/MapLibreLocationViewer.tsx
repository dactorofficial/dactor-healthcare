import React, { useEffect, useRef } from 'react'
import { MapPin, Navigation, ExternalLink, X, Compass } from 'lucide-react'

export interface MapLibreLocationViewerProps {
  lat: number
  lng: number
  clinicName: string
  addressText?: string
  mode?: 'inline' | 'modal'
  isOpen?: boolean
  onClose?: () => void
  height?: string
  className?: string
}

export const MapLibreLocationViewer: React.FC<MapLibreLocationViewerProps> = ({
  lat,
  lng,
  clinicName,
  addressText = 'Nepal',
  mode = 'inline',
  isOpen = true,
  onClose,
  height = '320px',
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  const effectiveLat = lat || 27.7052
  const effectiveLng = lng || 85.3193

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${effectiveLat},${effectiveLng}`

  useEffect(() => {
    if (mode === 'modal' && !isOpen) return

    let cancelled = false
    const initTimer = setTimeout(() => {
      if (cancelled || !mapContainerRef.current) return

      const L = (window as any).L
      if (!L) {
        console.warn('Leaflet not loaded on window')
        return
      }

      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {}
        mapRef.current = null
      }

      try {
        const map = L.map(mapContainerRef.current, {
          center: [effectiveLat, effectiveLng],
          zoom: 15,
          zoomControl: false,
          attributionControl: false,
        })
        mapRef.current = map

        L.control.zoom({ position: 'bottomright' }).addTo(map)

        // CARTO Voyager raster tiles
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
          }
        ).addTo(map)

        // Branded clinic pin marker with pulsing halo
        const clinicIcon = L.divIcon({
          className: 'custom-leaflet-clinic-marker',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 50px;">
              <div style="position: absolute; top: 3px; left: 0; width: 44px; height: 44px; background: rgba(14, 165, 233, 0.25); border-radius: 50%; animation: pulse 2s infinite ease-in-out;"></div>
              <div style="position: relative; z-index: 2; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35)); cursor: pointer;">
                <svg width="40" height="50" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 0C7.61 0 0 7.61 0 17c0 13.5 17 27 17 27s17-13.5 17-27C34 7.61 26.39 0 17 0z" fill="#0D9488"/>
                  <circle cx="17" cy="17" r="8" fill="#FFFFFF"/>
                  <path d="M15 11h4v4h4v4h-4v4h-4v-4h-4v-4h4v-4z" fill="#0D9488"/>
                </svg>
              </div>
            </div>
          `,
          iconSize: [44, 50],
          iconAnchor: [22, 50],
        })

        const marker = L.marker([effectiveLat, effectiveLng], {
          icon: clinicIcon,
        }).addTo(map)
        markerRef.current = marker

        setTimeout(() => {
          if (!cancelled && mapRef.current) {
            mapRef.current.invalidateSize()
          }
        }, 150)
      } catch (err) {
        console.error('Leaflet init error:', err)
      }
    }, 80)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {}
        mapRef.current = null
        markerRef.current = null
      }
    }
  }, [mode, isOpen, effectiveLat, effectiveLng])

  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.flyTo([effectiveLat, effectiveLng], 15, { duration: 1.5 })
    }
  }

  // --- Inline Mode ---
  if (mode === 'inline') {
    return (
      <div
        className={`relative w-full rounded-2xl overflow-hidden border border-slate-200/60 dark:border-white/10 shadow-glass-sm bg-slate-100 dark:bg-slate-900 ${className}`}
        style={{ height }}
      >
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Floating Clinic Info Overlay Badge */}
        <div className="absolute top-3 left-3 right-3 sm:right-auto sm:max-w-sm z-10 p-3 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/60 dark:border-white/10 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 truncate">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-glass-sm">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {clinicName}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {addressText}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <button
              type="button"
              onClick={handleRecenter}
              title="Recenter Map"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <Compass className="w-4 h-4" />
            </button>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-glass-sm transition flex items-center space-x-1 text-xs font-bold"
              title="Get Directions in Google Maps"
            >
              <Navigation className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Coordinates Strip at bottom */}
        <div className="absolute bottom-2 left-2 z-10 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-mono text-white pointer-events-none">
          GPS: {effectiveLat.toFixed(5)}, {effectiveLng.toFixed(5)}
        </div>
      </div>
    )
  }

  // --- Modal Mode ---
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 overflow-hidden animate-fade-in">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Surface */}
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[700px] flex flex-col rounded-3xl liquid-glass border border-white/40 dark:border-white/10 shadow-2xl overflow-hidden z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200/60 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3 truncate">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-glass-brand shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="truncate">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {clinicName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {addressText}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Canvas */}
        <div className="relative flex-1 w-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Quick Controls overlay */}
          <div className="absolute top-3 right-3 z-10 flex flex-col space-y-1.5">
            <button
              type="button"
              onClick={handleRecenter}
              title="Recenter on Clinic"
              className="p-2.5 rounded-xl bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 shadow-md border border-slate-200 dark:border-white/10 hover:bg-slate-50 transition"
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>

          {/* Coordinates readout */}
          <div className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-md border border-slate-200 dark:border-white/10 text-[11px] font-mono text-slate-700 dark:text-slate-300">
            Coordinates: <span className="font-bold text-teal-600 dark:text-teal-400">{effectiveLat.toFixed(5)}, {effectiveLng.toFixed(5)}</span>
          </div>
        </div>

        {/* Footer with Directions */}
        <div className="p-4 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60%]">
            <span className="font-bold text-slate-700 dark:text-slate-300">Location: </span>
            {addressText}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Close
            </button>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-500 hover:to-emerald-400 text-white text-xs font-bold shadow-glass-brand flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Google Maps Directions</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export const LeafletLocationViewer = MapLibreLocationViewer
export default MapLibreLocationViewer
