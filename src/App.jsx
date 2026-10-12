import { useEffect, useRef } from 'react'
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

// MapLibre 6 + Vite için resmî Worker yapılandırması
setWorkerUrl(workerUrl)

function App() {
  const mapContainer = useRef(null)

  useEffect(() => {
    if (!mapContainer.current) return

    const map = new Map({
      container: mapContainer.current,

      // OpenFreeMap: Gerçek OpenStreetMap verileri
      style: 'https://tiles.openfreemap.org/styles/liberty',

      // Marmara Üniversitesi Göztepe Kampüsü
      center: [29.0537, 40.9853],
      zoom: 16,
      minZoom: 13,
      maxZoom: 20,

      pitch: 0,
      bearing: 0,
    })

    map.addControl(new NavigationControl(), 'top-right')

    map.on('load', () => {
      console.log('✅ Harita başarıyla yüklendi!')
    })

    map.on('error', (event) => {
      console.error('Harita hatası:', event.error)
    })

    return () => map.remove()
  }, [])

  return (
    <main className="app">
      <div ref={mapContainer} className="map-container" />

      <header className="map-header">
        <div className="map-header-icon">⌖</div>

        <div className="map-header-text">
          <h1>Göztepe Kampüsü</h1>
          <p>Marmara Üniversitesi</p>
        </div>
      </header>

      <div className="map-status">
        <span className="status-dot" />
        Harita prototipi · v0.1
      </div>
    </main>
  )
}

export default App