import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { centroid } from '@turf/centroid'
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

setWorkerUrl(workerUrl)

function App() {
  const mapContainer = useRef(null)
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

    map.addControl(new NavigationControl(), 'top-right')

    let selectedId = null
    let popup = null
    let cancelled = false

    async function loadCampusData() {
      try {
        const [buildingsResponse, boundaryResponse] = await Promise.all([
          fetch('/data/goztepe-buildings-raw.geojson'),
          fetch('/data/goztepe-boundary.geojson'),
        ])

        if (!buildingsResponse.ok || !boundaryResponse.ok) {
          throw new Error('GeoJSON dosyalarından biri yüklenemedi.')
        }

        const buildings = await buildingsResponse.json()
        const boundary = await boundaryResponse.json()

        if (cancelled) return

        const campusBoundary = boundary.features?.[0]

        if (
          !campusBoundary ||
          !['Polygon', 'MultiPolygon'].includes(campusBoundary.geometry?.type)
        ) {
          throw new Error('Kampüs sınırı geçerli bir Polygon değil.')
        }

        // Bina merkezleri sınırın içinde mi?
        const campusBuildings = buildings.features.filter((building) => {
          if (
            !['Polygon', 'MultiPolygon'].includes(building.geometry?.type)
          ) {
            return false
          }

          const buildingCenter = centroid(building)

          return booleanPointInPolygon(buildingCenter, campusBoundary)
        })

        const filteredGeoJSON = {
          type: 'FeatureCollection',
          features: campusBuildings,
        }

        setBuildingCount(campusBuildings.length)

        // Kampüs sınırı
        map.addSource('campus-boundary', {
          type: 'geojson',
          data: boundary,
        })

        map.addLayer({
          id: 'campus-boundary-line',
          type: 'line',
          source: 'campus-boundary',
          paint: {
            'line-color': '#7654c4',
            'line-width': 3,
            'line-dasharray': [3, 2],
          },
        })

        // Filtrelenmiş binalar
        map.addSource('campus-buildings', {
          type: 'geojson',
          data: filteredGeoJSON,
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
              '#7046c8',
              '#bba8e7',
            ],
            'fill-opacity': 0.75,
          },
        })

        map.addLayer({
          id: 'campus-building-outline',
          type: 'line',
          source: 'campus-buildings',
          paint: {
            'line-color': '#6c529e',
            'line-width': 1.5,
          },
        })

        // Binaya tıklama
        map.on('click', 'campus-building-fill', (event) => {
          const building = event.features?.[0]
          if (!building) return

          if (selectedId !== null) {
            map.setFeatureState(
              { source: 'campus-buildings', id: selectedId },
              { selected: false }
            )
          }

          selectedId = building.id

          map.setFeatureState(
            { source: 'campus-buildings', id: selectedId },
            { selected: true }
          )

          popup?.remove()

          popup = new Popup({ offset: 12 })
            .setLngLat(event.lngLat)
            .setText(building.properties?.name || 'İsimsiz bina')
            .addTo(map)
        })

        map.on('mouseenter', 'campus-building-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', 'campus-building-fill', () => {
          map.getCanvas().style.cursor = ''
        })

        console.log(
          `Toplam ${buildings.features.length} binadan ` +
          `${campusBuildings.length} tanesi kampüs sınırında.`
        )
      } catch (err) {
        if (!cancelled) {
          console.error(err)
          setError(err.message)
        }
      }
    }

    map.once('load', loadCampusData)

    return () => {
      cancelled = true
      popup?.remove()
      map.remove()
    }
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
        {error
          ? `Hata: ${error}`
          : buildingCount === null
            ? 'Binalar yükleniyor...'
            : `${buildingCount} bina · Kampüs prototipi v0.3`}
      </div>
    </main>
  )
}

export default App