import React, { useEffect, useRef, useState } from 'react'
import { MapPin, Crosshair, Check, X, Search, Loader2 } from 'lucide-react'

export interface MapLibreLocationPickerProps {
  isOpen: boolean
  onClose: () => void
  initialLat?: number
  initialLng?: number
  initialAddress?: string
  onSelectLocation: (data: { lat: number; lng: number; address: string }) => void
}

const NEPAL_PRESETS = [
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
  { name: 'Dharan (BPKIHS Area)', lat: 26.8124, lng: 87.2834 },
]

export const MapLibreLocationPicker: React.FC<MapLibreLocationPickerProps> = ({
  isOpen,
  onClose,
  initialLat = 27.7052,
  initialLng = 85.3193,
  initialAddress = '',
  onSelectLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  const [currentLat, setCurrentLat] = useState<number>(initialLat || 27.7052)
  const [currentLng, setCurrentLng] = useState<number>(initialLng || 85.3193)
  const [addressInput, setAddressInput] = useState<string>(initialAddress)
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false)
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false)

  // Reverse geocode via OpenStreetMap Nominatim
  const reverseGeocode = async (lat: number, lng: number) => {
    setIsGeocoding(true)
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      )
      if (resp.ok) {
        const data = await resp.json()
        if (data && data.display_name) {
          const parts = [
            data.address?.amenity || data.address?.building || data.address?.road,
            data.address?.suburb || data.address?.neighbourhood,
            data.address?.city || data.address?.town || data.address?.village,
            data.address?.state,
          ].filter(Boolean)
          const formatted = parts.length > 0 ? parts.join(', ') : data.display_name
          setAddressInput(formatted)
          return
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsGeocoding(false)
    }

    if (!addressInput.trim()) {
      setAddressInput(`Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`)
    }
  }

  // Handle live GPS
  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }
    setIsLocatingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false)
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setCurrentLat(lat)
        setCurrentLng(lng)
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lng], 16, { duration: 1.5 })
        }
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        }
        reverseGeocode(lat, lng)
      },
      (err) => {
        setIsLocatingGps(false)
        alert(`Failed to detect location: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // Initialize Leaflet Map
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    const initTimer = setTimeout(() => {
      if (cancelled || !mapContainerRef.current) return

      const L = (window as any).L
      if (!L) {
        console.warn('Leaflet script not loaded yet')
        return
      }

      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {}
        mapRef.current = null
      }

      const initialCenter: [number, number] = [
        initialLat || 27.7052,
        initialLng || 85.3193,
      ]

      try {
        const map = L.map(mapContainerRef.current, {
          center: initialCenter,
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

        // Custom draggable pin icon
        const pinIcon = L.divIcon({
          className: 'custom-leaflet-picker-pin',
          html: `
            <div style="cursor: grab; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.35));">
              <svg width="38" height="48" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 0C7.61 0 0 7.61 0 17c0 13.5 17 27 17 27s17-13.5 17-27C34 7.61 26.39 0 17 0z" fill="#0284C7"/>
                <circle cx="17" cy="17" r="7.5" fill="#FFFFFF"/>
                <circle cx="17" cy="17" r="3.5" fill="#0284C7"/>
              </svg>
            </div>
          `,
          iconSize: [38, 48],
          iconAnchor: [19, 48],
        })

        const marker = L.marker(initialCenter, {
          icon: pinIcon,
          draggable: true,
        }).addTo(map)
        markerRef.current = marker

        marker.on('dragend', () => {
          const latLng = marker.getLatLng()
          setCurrentLat(latLng.lat)
          setCurrentLng(latLng.lng)
          reverseGeocode(latLng.lat, latLng.lng)
        })

        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng)
          setCurrentLat(e.latlng.lat)
          setCurrentLng(e.latlng.lng)
          reverseGeocode(e.latlng.lat, e.latlng.lng)
        })

        setTimeout(() => {
          if (!cancelled && mapRef.current) {
            mapRef.current.invalidateSize()
          }
        }, 150)

        if (!initialAddress.trim()) {
          reverseGeocode(initialCenter[0], initialCenter[1])
        }
      } catch (err) {
        console.error('Failed to initialize Leaflet:', err)
      }
    }, 100)

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
  }, [isOpen])

  // Select preset city
  const handleSelectPreset = (preset: (typeof NEPAL_PRESETS)[0]) => {
    setCurrentLat(preset.lat)
    setCurrentLng(preset.lng)
    setAddressInput(preset.name)
    if (mapRef.current) {
      mapRef.current.flyTo([preset.lat, preset.lng], 15, { duration: 1.5 })
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([preset.lat, preset.lng])
    }
  }

  // Save location
  const handleConfirm = () => {
    onSelectLocation({
      lat: currentLat,
      lng: currentLng,
      address: addressInput.trim() || `Location (${currentLat.toFixed(5)}, ${currentLng.toFixed(5)})`,
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Dialog Surface */}
      <div className="relative w-full max-w-4xl h-[90vh] max-h-[760px] flex flex-col rounded-3xl liquid-glass border border-white/40 dark:border-white/10 shadow-2xl overflow-hidden z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200/60 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 to-teal-500 flex items-center justify-center text-white shadow-glass-brand">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Interactive Location Picker
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click on map or drag pin to target clinic premises
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

        {/* Search & Actions Bar */}
        <div className="p-4 space-y-3 border-b border-slate-200/50 dark:border-white/10 bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Physical address, landmark, or area name..."
                className="w-full pl-9 pr-8 py-2 text-xs font-semibold rounded-xl liquid-glass-input text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-white/10 focus:border-brand-500"
              />
              {isGeocoding && (
                <Loader2 className="w-4 h-4 absolute right-3 top-2.5 text-brand-500 animate-spin" />
              )}
            </div>

            <button
              type="button"
              onClick={handleDetectGps}
              disabled={isLocatingGps}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-glass-brand transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
            >
              {isLocatingGps ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Crosshair className="w-3.5 h-3.5" />
              )}
              <span>{isLocatingGps ? 'Locating...' : 'Use My GPS'}</span>
            </button>
          </div>

          {/* Quick Nepal Preset Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            <span className="font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap text-[10px] uppercase tracking-wider mr-1">
              Nepal Presets:
            </span>
            {NEPAL_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:border-brand-500 bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-semibold whitespace-nowrap hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all cursor-pointer"
              >
                {preset.name.split(' (')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Map Container */}
        <div className="relative flex-1 w-full bg-slate-100 dark:bg-slate-950 overflow-hidden min-h-[300px]">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Instruction Pill */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-md border border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-700 dark:text-slate-300 pointer-events-none">
            📍 Drag marker or click anywhere on map to pin clinic
          </div>

          {/* Floating Coordinates readout */}
          <div className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-md border border-slate-200 dark:border-white/10 text-[11px] font-mono text-slate-700 dark:text-slate-300">
            GPS: <span className="font-bold text-brand-600 dark:text-brand-400">{currentLat.toFixed(5)}, {currentLng.toFixed(5)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60%]">
            <span className="font-bold text-slate-700 dark:text-slate-300">Target: </span>
            {addressInput || 'No address specified'}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-teal-500 hover:from-brand-500 hover:to-teal-400 text-white text-xs font-bold shadow-glass-brand flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>Confirm Location</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const LeafletLocationPicker = MapLibreLocationPicker
export default MapLibreLocationPicker
