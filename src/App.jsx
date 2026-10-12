import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { excludeBaseBuildings } from './excludeBaseBuildings'

import { applyCampusStyle, campusColors } from './campusStyle'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

// MapLibre 6 + Vite Worker yapılandırması
setWorkerUrl(workerUrl)

function App() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const selectedIdRef = useRef(null)

  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [buildingCount, setBuildingCount] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!mapContainer.current) return

    // Haritayı oluştur
    const map = new Map({
      container: mapContainer.current,

      style: 'https://tiles.openfreemap.org/styles/liberty',

      center: [29.0537, 40.9853],
      zoom: 16,
      minZoom: 13,
      maxZoom: 20,

      pitch: 40,
      bearing: -20,
    })

    mapRef.current = map

    map.addControl(
      new NavigationControl({
        showZoom: true,
        showCompass: true,
      }),
      'top-right'
    )

    let cancelled = false

    // Kampüs bina verilerini yükle
    async function loadBuildings() {
      try {
        const [
  response,
  boundaryResponse,
  rawBuildingsResponse,
] = await Promise.all([
  fetch('/data/goztepe-buildings-3d.geojson'),
  fetch('/data/goztepe-boundary.geojson'),
  fetch('/data/goztepe-buildings-raw.geojson'),
])

        if (
  !response.ok ||
  !boundaryResponse.ok ||
  !rawBuildingsResponse.ok
) {
  throw new Error('GeoJSON dosyalarından biri yüklenemedi.')
}

        const data = await response.json()
const boundary = await boundaryResponse.json()
const rawBuildings = await rawBuildingsResponse.json()

if (cancelled) return

excludeBaseBuildings(map, boundary, rawBuildings)

        setBuildingCount(data.features.length)

        // GeoJSON kaynağı
        map.addSource('campus-buildings', {
          type: 'geojson',
          data,
          generateId: true,
        })

        // 2.5D binalar
        map.addLayer({
          id: 'campus-building-fill',
          type: 'fill-extrusion',
          source: 'campus-buildings',

          paint: {
            // Seçili bina koyu mor
            'fill-extrusion-color': [
              'case',
              [
                'boolean',
                ['feature-state', 'selected'],
                false,
              ],
              campusColors.selected,
              campusColors.building,
            ],

            // GeoJSON'dan bina yüksekliğini al
            'fill-extrusion-height': [
              'to-number',
              ['get', 'displayHeight'],
              12,
            ],

            'fill-extrusion-base': 0,

            'fill-extrusion-opacity': 0.95,

            'fill-extrusion-vertical-gradient': true,
          },
        })

        // Binaya tıklama
        map.on('click', 'campus-building-fill', (event) => {
          const feature = event.features?.[0]

          if (!feature) return

          // Önceki seçimi temizle
          if (selectedIdRef.current !== null) {
            map.setFeatureState(
              {
                source: 'campus-buildings',
                id: selectedIdRef.current,
              },
              { selected: false }
            )
          }

          // Yeni binayı seç
          selectedIdRef.current = feature.id

          map.setFeatureState(
            {
              source: 'campus-buildings',
              id: feature.id,
            },
            { selected: true }
          )

          // Bina içindeki birimleri oku
          let units = feature.properties?.marmaraUnits || []

          if (typeof units === 'string') {
            try {
              units = JSON.parse(units)
            } catch {
              units = []
            }
          }

          if (!Array.isArray(units)) {
            units = []
          }

          // Bilgi kartını aç
          setSelectedBuilding({
            name:
              feature.properties?.name ||
              units[0]?.name ||
              'Henüz isimlendirilmemiş bina',

            units,

            height:
              Number(feature.properties?.displayHeight) || 12,

            heightSource:
              feature.properties?.heightSource || 'placeholder',
          })
        })

        // Fare imlecini değiştir
        map.on('mouseenter', 'campus-building-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', 'campus-building-fill', () => {
          map.getCanvas().style.cursor = ''
        })

        console.log(
          `✅ ${data.features.length} kampüs binası yüklendi.`
        )
      } catch (err) {
        if (!cancelled) {
          console.error('Bina yükleme hatası:', err)
          setError(err.message)
        }
      }
    }

    // Harita hazır olduğunda stil ve binaları yükle
    map.once('load', () => {
      if (cancelled) return

      try {
        applyCampusStyle(map)
        loadBuildings()
      } catch (err) {
        console.error(err)
        setError(err.message)
      }
    })

    map.on('error', (event) => {
      console.error('Harita hatası:', event.error)
    })

    // Temizlik
    return () => {
      cancelled = true
      map.remove()
      mapRef.current = null
      selectedIdRef.current = null
    }
  }, [])

  // Bilgi kartını kapat
  function closeCard() {
    const map = mapRef.current

    if (
      map &&
      map.getSource('campus-buildings') &&
      selectedIdRef.current !== null
    ) {
      map.setFeatureState(
        {
          source: 'campus-buildings',
          id: selectedIdRef.current,
        },
        { selected: false }
      )
    }

    selectedIdRef.current = null
    setSelectedBuilding(null)
  }

  return (
    <main className="app">

      {/* Harita */}
      <div
        ref={mapContainer}
        className="map-container"
        aria-label="Göztepe Kampüsü haritası"
      />

      {/* Üst başlık */}
      <header className="map-header">
        <div className="map-header-icon">⌖</div>

        <div className="map-header-text">
          <h1>Göztepe Kampüsü</h1>
          <p>Marmara Üniversitesi</p>
        </div>
      </header>

      {/* Durum bilgisi */}
      <div className="map-status">
        <span className="status-dot" />

        {error
          ? `Hata: ${error}`
          : buildingCount === null
            ? 'Binalar yükleniyor...'
            : `${buildingCount} bina · Prototip v0.7`}
      </div>

      {/* Seçilen bina bilgi kartı */}
      {selectedBuilding && (
        <section className="building-card">

          <button
            className="card-close"
            onClick={closeCard}
            aria-label="Kartı kapat"
          >
            ×
          </button>

          <div className="card-label">
            SEÇİLEN BİNA
          </div>

          <h2>{selectedBuilding.name}</h2>

          {selectedBuilding.units.length > 0 ? (
            <>
              <p className="card-description">
                Bu binayla ilişkilendirilen birimler
              </p>

              <div className="unit-list">
                {selectedBuilding.units.map((unit, index) => (
                  <div className="unit-item" key={index}>

                    <span className="unit-category">
                      {unit.category}
                    </span>

                    <strong>{unit.name}</strong>

                    {unit.website && (
                      <a
                        href={unit.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Web sitesi ↗
                      </a>
                    )}

                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="card-description">
              Bu bina henüz isimlendirilmedi.
            </p>
          )}

        </section>
      )}

    </main>
  )
}

export default App