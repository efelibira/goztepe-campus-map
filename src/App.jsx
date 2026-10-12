import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import { excludeBaseBuildings } from './excludeBaseBuildings'
import { applyCampusStyle, campusColors } from './campusStyle'
import BuildingEditor from './BuildingEditor'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

setWorkerUrl(workerUrl)

const STORAGE_KEY = 'goztepe-building-overrides-v1'

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function parseUnits(value) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

// Mümkün olduğunda OSM kimliğini kullan.
// Kimlik yoksa geometrinin ilk koordinatından kararlı anahtar oluştur.
function getBuildingId(feature) {
  const properties = feature.properties || {}

  const osmId =
    properties['@id'] ??
    properties.osm_id ??
    feature.id

  if (osmId !== undefined && osmId !== null) {
    return `osm:${osmId}`
  }

  const coordinates = feature.geometry?.coordinates
  let point = coordinates

  while (Array.isArray(point) && Array.isArray(point[0])) {
    point = point[0]
  }

  if (
    Array.isArray(point) &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
  ) {
    return `geometry:${Number(point[0]).toFixed(7)},${Number(point[1]).toFixed(7)}`
  }

  throw new Error('Bir binanın kararlı kimliği oluşturulamadı.')
}

function App() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const selectedIdRef = useRef(null)
  const editModeRef = useRef(false)
  const overridesRef = useRef(loadOverrides())

  const [editMode, setEditMode] = useState(false)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [buildingCount, setBuildingCount] = useState(null)
  const [poiList, setPoiList] = useState([])
  const [overrides, setOverrides] = useState(overridesRef.current)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!mapContainer.current) return

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

    async function loadBuildings() {
      try {
        const [
          buildingsResponse,
          boundaryResponse,
          rawResponse,
          poisResponse,
        ] = await Promise.all([
          fetch('/data/goztepe-buildings-3d.geojson'),
          fetch('/data/goztepe-boundary.geojson'),
          fetch('/data/goztepe-buildings-raw.geojson'),
          fetch('/data/goztepe-poi.geojson'),
        ])

        if (
          !buildingsResponse.ok ||
          !boundaryResponse.ok ||
          !rawResponse.ok ||
          !poisResponse.ok
        ) {
          throw new Error('GeoJSON dosyalarından biri yüklenemedi.')
        }

        const buildings = await buildingsResponse.json()
        const boundary = await boundaryResponse.json()
        const rawBuildings = await rawResponse.json()
        const pois = await poisResponse.json()

        if (cancelled) return

        // POI listesi düzenleyicide kullanılacak.
        setPoiList(
          pois.features.map((feature) => ({
            name: feature.properties?.name || '',
            category: feature.properties?.category || 'Diğer',
            website: feature.properties?.website || null,
          }))
        )

        // Orijinal GeoJSON'a kararlı feature.id ekle.
        const seenIds = new Set()

        // Her bina için kalıcı kimlik oluştur.


const features = buildings.features.map((feature) => {
  const id = getBuildingId(feature)

  if (seenIds.has(id)) {
    throw new Error(`Tekrarlanan bina kimliği: ${id}`)
  }

  seenIds.add(id)

  return {
    ...feature,
    id,
    properties: {
      ...feature.properties,
      buildingKey: id,
    },
  }
})
          const data = {
            type: 'FeatureCollection',
            features,
          }

          // Mevcut gri 3D bina çakışması çözümü.
          excludeBaseBuildings(map, boundary, rawBuildings)

          setBuildingCount(features.length)

          map.addSource('campus-buildings', {
            type: 'geojson',
            data,
            promoteId: 'buildingKey',
          })

          map.addLayer({
            id: 'campus-building-fill',
            type: 'fill-extrusion',
            source: 'campus-buildings',
            paint: {
              'fill-extrusion-color': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                campusColors.selected,
                campusColors.building,
              ],
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

          // Binaya tıklama.
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

            const id = feature.id
            selectedIdRef.current = id

            map.setFeatureState(
              { source: 'campus-buildings', id },
              { selected: true }
            )

            const properties = feature.properties || {}
            const originalUnits = parseUnits(properties.marmaraUnits)
            const override = overridesRef.current[id] || {}

            setSelectedBuilding({
              id,
              osmName: properties.name || '',
              name:
                override.name ??
                properties.name ??
                originalUnits[0]?.name ??
                'Henüz isimlendirilmemiş bina',
              units: override.units ?? originalUnits,
              status: override.status ?? 'unreviewed',
            })
          })

          map.on('mouseenter', 'campus-building-fill', () => {
            map.getCanvas().style.cursor = 'pointer'
          })

          map.on('mouseleave', 'campus-building-fill', () => {
            map.getCanvas().style.cursor = ''
          })
          // Daha önce kaydedilen doğrulama durumlarını uygula.
          for (const [id, value] of Object.entries(overridesRef.current)) {
            map.setFeatureState(
              {
                source: 'campus-buildings',
                id,
              },
              {
                reviewStatus: value.status || 'unreviewed',
              }
            )
          }
          console.log(`✅ ${features.length} kampüs binası yüklendi.`)
        } catch (err) {
          if (!cancelled) {
            console.error(err)
            setError(err.message)
          }
        }
      }

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

      return () => {
        cancelled = true
        map.remove()
        mapRef.current = null
        selectedIdRef.current = null
      }
    }, [])

  // Düzenleme modu değişince bina renklerini güncelle.
  useEffect(() => {
    const map = mapRef.current

    if (!map?.getLayer('campus-building-fill')) return

    const colorExpression = editMode
      ? [
        'case',

        ['boolean', ['feature-state', 'selected'], false],
        campusColors.selected,

        ['==', ['feature-state', 'reviewStatus'], 'verified'],
        '#89c5a3',

        ['==', ['feature-state', 'reviewStatus'], 'uncertain'],
        '#e9c77e',

        '#c9c9c9',
      ]
      : [
        'case',

        ['boolean', ['feature-state', 'selected'], false],
        campusColors.selected,

        campusColors.building,
      ]

    map.setPaintProperty(
      'campus-building-fill',
      'fill-extrusion-color',
      colorExpression
    )
  }, [editMode])

  // Kayıt durumlarını harita üzerinde göster.
  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('campus-buildings')) return

    for (const [id, value] of Object.entries(overrides)) {
      map.setFeatureState(
        { source: 'campus-buildings', id },
        { reviewStatus: value.status || 'unreviewed' }
      )
    }
  }, [overrides])

  function closeCard() {
    const map = mapRef.current

    if (
      map?.getSource('campus-buildings') &&
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

  function toggleEditMode() {
    closeCard()
    setEditMode((previous) => !previous)
  }

  function saveBuilding(id, changes) {
    const next = {
      ...overridesRef.current,
      [id]: changes,
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (err) {
      setError('Değişiklikler tarayıcıya kaydedilemedi.')
      console.error(err)
      return
    }

    overridesRef.current = next
    setOverrides(next)

    setSelectedBuilding((previous) =>
      previous?.id === id
        ? { ...previous, ...changes }
        : previous
    )

    const map = mapRef.current

    if (map?.getSource('campus-buildings')) {
      map.setFeatureState(
        { source: 'campus-buildings', id },
        { reviewStatus: changes.status }
      )
    }
  }

  function exportOverrides() {
    const content = JSON.stringify(
      {
        version: 1,
        project: 'goztepe-campus-map',
        updatedAt: new Date().toISOString(),
        buildings: overridesRef.current,
      },
      null,
      2
    )

    const blob = new Blob([content], {
      type: 'application/json',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'building-overrides.json'
    document.body.appendChild(link)
    link.click()
    link.remove()

    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <main className="app">
      <div
        ref={mapContainer}
        className="map-container"
        aria-label="Göztepe Kampüsü interaktif haritası"
      />

      <header className="map-header">
        <div className="map-header-icon">⌖</div>
        <div className="map-header-text">
          <h1>Göztepe Kampüsü</h1>
          <p>Marmara Üniversitesi</p>
        </div>
      </header>

      <div className="edit-toolbar">
        <button
          type="button"
          className={editMode ? 'edit-toggle active' : 'edit-toggle'}
          onClick={toggleEditMode}
        >
          {editMode ? '✓ Düzenleme açık' : '✎ Düzenleme modu'}
        </button>

        {editMode && (
          <button
            type="button"
            className="edit-export"
            onClick={exportOverrides}
          >
            JSON indir
          </button>
        )}
      </div>

      <div className="map-status">
        <span className="status-dot" />
        {error ||
          (buildingCount === null
            ? 'Binalar yükleniyor...'
            : `${buildingCount} bina · Prototip v0.8`)}
      </div>

      {selectedBuilding && editMode ? (
        <BuildingEditor
          key={selectedBuilding.id}
          building={selectedBuilding}
          poiList={poiList}
          onSave={saveBuilding}
          onClose={closeCard}
        />
      ) : selectedBuilding ? (
        <section className="building-card">
          <button
            type="button"
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
      ) : null}
    </main>
  )
}

export default App