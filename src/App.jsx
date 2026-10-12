import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

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

    const map = new Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [29.0537, 40.9853],
      zoom: 16,
      pitch: 0,
      bearing: 0,
    })

    mapRef.current = map
    map.addControl(new NavigationControl(), 'top-right')

    let cancelled = false

    async function loadBuildings() {
      try {
        const response = await fetch(
          '/data/goztepe-buildings-matched.geojson'
        )

        if (!response.ok) {
          throw new Error('Eşleştirilmiş bina verileri yüklenemedi.')
        }

        const data = await response.json()
        if (cancelled) return

        setBuildingCount(data.features.length)

        map.addSource('campus-buildings', {
          type: 'geojson',
          data,
          generateId: true,
        })

        map.addLayer({
          id: 'campus-building-fill',
          type: 'fill',
          source: 'campus-buildings',
          paint: {
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#7952cc',
              '#c5b3ed',
            ],
            'fill-opacity': 0.8,
          },
        })

        map.addLayer({
          id: 'campus-building-outline',
          type: 'line',
          source: 'campus-buildings',
          paint: {
            'line-color': '#775aaf',
            'line-width': 1.5,
          },
        })

        map.on('click', 'campus-building-fill', (event) => {
          const feature = event.features?.[0]
          if (!feature) return

          if (selectedIdRef.current !== null) {
            map.setFeatureState(
              {
                source: 'campus-buildings',
                id: selectedIdRef.current,
              },
              { selected: false }
            )
          }

          selectedIdRef.current = feature.id

          map.setFeatureState(
            {
              source: 'campus-buildings',
              id: feature.id,
            },
            { selected: true }
          )

          // GeoJSON özelliklerindeki diziler MapLibre tarafından
          // string olarak döndürülebilir.
          let units = feature.properties?.marmaraUnits || []

          if (typeof units === 'string') {
            try {
              units = JSON.parse(units)
            } catch {
              units = []
            }
          }

          if (!Array.isArray(units)) units = []

          setSelectedBuilding({
            name:
              feature.properties?.name ||
              units[0]?.name ||
              'Henüz isimlendirilmemiş bina',
            units,
          })
        })

        map.on('mouseenter', 'campus-building-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', 'campus-building-fill', () => {
          map.getCanvas().style.cursor = ''
        })
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError(err.message)
        }
      }
    }

    map.once('load', loadBuildings)

    return () => {
      cancelled = true
      map.remove()
      mapRef.current = null
    }
  }, [])

  function closeCard() {
    const map = mapRef.current

    if (map && selectedIdRef.current !== null) {
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
        {error ||
          (buildingCount === null
            ? 'Binalar yükleniyor...'
            : `${buildingCount} bina · Prototip v0.5`)}
      </div>

      {selectedBuilding && (
        <section className="building-card">
          <button
            className="card-close"
            onClick={closeCard}
            aria-label="Kartı kapat"
          >
            ×
          </button>

          <div className="card-label">SEÇİLEN BİNA</div>

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