import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { centroid } from '@turf/centroid'
import { buildWalkingGraph, findWalkingRoute } from './routeEngine'

import { excludeBaseBuildings } from './excludeBaseBuildings'
import { applyCampusStyle, campusColors } from './campusStyle'
import BuildingEditor from './BuildingEditor'
import SearchPanel from './SearchPanel'
import { usePanelPresence } from './usePanelPresence'
import { syncBuildingLabels } from './buildingLabels'
import { HOME_CAMERA, CAMERA_ANIMATION_DURATION, BUILDING_CAMERA } from './mapCamera'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'
import './panelMotion.css'
import './routeStyles.css'

setWorkerUrl(workerUrl)

const STORAGE_KEY = 'goztepe-building-overrides-v1'

function loadOverrides() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {}
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

function getBuildingId(feature) {
  const properties = feature.properties || {}

  const osmId =
    properties['@id'] ??
    properties.osm_id ??
    feature.id

  if (osmId !== undefined && osmId !== null) {
    return String(osmId).startsWith('osm:')
      ? String(osmId)
      : `osm:${osmId}`
  }

  let point = feature.geometry?.coordinates

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

  throw new Error('Bir binanın kimliği oluşturulamadı.')
}

function getBuildingInfo(feature, overrides) {
  const properties = feature.properties || {}
  const originalUnits = parseUnits(properties.marmaraUnits)
  const override = overrides[feature.id] || {}

  return {
    id: feature.id,
    osmName: properties.name || '',
    name:
      override.name ??
      properties.name ??
      originalUnits[0]?.name ??
      'Henüz isimlendirilmemiş bina',
    units: override.units ?? originalUnits,
    status: override.status ?? 'unreviewed',
  }
}

function App() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const selectedIdRef = useRef(null)
  const featuresRef = useRef(new Map())
  const routeGraphRef = useRef(null)
  const activeRouteIdRef = useRef(null)
  const overridesRef = useRef(loadOverrides())

  const [editMode, setEditMode] = useState(false)
  const [mapMode, setMapMode] = useState('3d')
  const mapModeRef = useRef('3d')
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [buildingCount, setBuildingCount] = useState(null)
  const [buildingFeatures, setBuildingFeatures] = useState([])
  const [poiList, setPoiList] = useState([])
  const [overrides, setOverrides] = useState(overridesRef.current)
  const [error, setError] = useState('')
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [animationsEnabled, setAnimationsEnabled] = useState(() => {
    try {
      return localStorage.getItem('goztepe-panel-animations') !== 'off'
    } catch {
      return true
    }
  })

  const { presented: visibleBuilding, exiting: cardExiting } =
    usePanelPresence(selectedBuilding, 160, animationsEnabled)

  function toggleAnimations() {
    setAnimationsEnabled((previous) => {
      const next = !previous
      try {
        localStorage.setItem('goztepe-panel-animations', next ? 'on' : 'off')
      } catch {
        // Private browsing can block storage. Keep the setting for this session.
      }
      return next
    })
  }

  const searchableBuildings = useMemo(
    () =>
      buildingFeatures.map((feature) =>
        getBuildingInfo(feature, overrides)
      ),
    [buildingFeatures, overrides]
  )

  function clearRoute() {
    activeRouteIdRef.current = null
    setRouteInfo(null)
    setRouteError('')
    const source = mapRef.current?.getSource('campus-route')
    if (source) source.setData({ type: 'FeatureCollection', features: [] })
    const points = mapRef.current?.getSource('campus-route-points')
    if (points) points.setData({ type: 'FeatureCollection', features: [] })
  }

  function showRoute() {
    const map = mapRef.current
    const targetId = selectedIdRef.current
    if (!map || targetId === null) return
    if (String(targetId) === 'osm:way/1020362430') {
      setRouteError('Zaten A Kapısı’ndasın. Başka bir bina seç.')
      return
    }
    try {
      const result = findWalkingRoute(routeGraphRef.current, featuresRef.current, targetId)
      const routeSource = map.getSource('campus-route')
      const pointSource = map.getSource('campus-route-points')
      if (!routeSource || !pointSource) throw new Error('Rota katmanı henüz hazır değil.')
      routeSource.setData({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: result.coordinates },
      })
      pointSource.setData({
        type: 'FeatureCollection',
        features: [result.start, result.end].map((coord, i) => ({
          type: 'Feature', properties: { point: i },
          geometry: { type: 'Point', coordinates: coord },
        })),
      })
      activeRouteIdRef.current = String(targetId)
      setRouteInfo(result)
      setRouteError('')
      const lngs = result.coordinates.map((point) => point[0])
      const lats = result.coordinates.map((point) => point[1])
      map.fitBounds([
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ], {
        padding: { top: 110, right: 90, bottom: 90, left: Math.min(380, window.innerWidth * .28) },
        duration: CAMERA_ANIMATION_DURATION,
        maxZoom: 18,
        pitch: mapModeRef.current === '3d' ? 35 : 0,
        bearing: mapModeRef.current === '3d' ? map.getBearing() : 0,
      })
    } catch (err) {
      clearRoute()
      setRouteError(err.message || 'Rota hesaplanamadı.')
    }
  }

  // Hem harita tıklaması hem arama sonucu aynı seçim işlemini kullanır.
  function selectBuilding(id, moveCamera = false) {
    const map = mapRef.current
    const feature = featuresRef.current.get(String(id))

    if (!map || !feature || !map.getSource('campus-buildings')) {
      return
    }

    if (activeRouteIdRef.current && activeRouteIdRef.current !== String(id)) clearRoute()

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

    setSelectedBuilding(
      getBuildingInfo(feature, overridesRef.current)
    )

    if (moveCamera) {
      try {
        const center = centroid(feature).geometry.coordinates

        map.flyTo({
          center,
          zoom: Math.max(map.getZoom(), BUILDING_CAMERA.minZoom),
          pitch: mapModeRef.current === '3d' ? BUILDING_CAMERA.pitch : 0,
          bearing: mapModeRef.current === '3d' ? map.getBearing() : 0,
          essential: true,
          duration: CAMERA_ANIMATION_DURATION,
        })
      } catch (err) {
        console.warn('Binaya kamera hareketi yapılamadı:', err)
      }
    }
  }

  useEffect(() => {
    if (!mapContainer.current) return
const map = new MapLibreMap({
  container: mapContainer.current,
  style: 'https://tiles.openfreemap.org/styles/liberty',
  ...HOME_CAMERA,
  zoom: 16.7,
  minZoom: 16,
  maxZoom: 20,
  pitch: 30,
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
          overridesResponse,
          walkwaysResponse,
        ] = await Promise.all([
          fetch('/data/goztepe-buildings-3d.geojson'),
          fetch('/data/goztepe-boundary.geojson'),
          fetch('/data/goztepe-surroundings.geojson'),
          fetch('/data/goztepe-poi.geojson'),
          fetch('/data/building-overrides.json'),
          fetch('/data/goztepe-walkways.geojson'),
        ])

        if (
          !buildingsResponse.ok ||
          !boundaryResponse.ok ||
          !rawResponse.ok ||
          !poisResponse.ok ||
          !overridesResponse.ok ||
          !walkwaysResponse.ok
        ) {
          throw new Error('Harita veri dosyalarından biri yüklenemedi.')
        }

        const buildings = await buildingsResponse.json()
        const boundary = await boundaryResponse.json()
        const rawBuildings = await rawResponse.json()
        const pois = await poisResponse.json()
        const publishedOverrides = await overridesResponse.json()
        const walkways = await walkwaysResponse.json()

        if (cancelled) return

        if (
          !publishedOverrides ||
          !publishedOverrides.buildings ||
          typeof publishedOverrides.buildings !== 'object' ||
          Array.isArray(publishedOverrides.buildings)
        ) {
          throw new Error('Bina düzeltme JSON dosyasının biçimi hatalı.')
        }

        // Yayınlanan düzeltmeler + Safari'deki düzenlemeler.
        // Safari kayıtları önceliklidir.
        const mergedOverrides = {
          ...publishedOverrides.buildings,
          ...overridesRef.current,
        }

        delete mergedOverrides['0']

        overridesRef.current = mergedOverrides
        setOverrides(mergedOverrides)

        setPoiList(
          pois.features.map((feature) => ({
            name: feature.properties?.name || '',
            category: feature.properties?.category || 'Diğer',
            website: feature.properties?.website || null,
          }))
        )

        const seenIds = new Set()

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

        featuresRef.current = new Map(
          features.map((feature) => [String(feature.id), feature])
        )
        routeGraphRef.current = buildWalkingGraph(walkways)

        // Mevcut çevre binaları ve çakışma çözümü korunuyor.
        excludeBaseBuildings(map, boundary, rawBuildings)

        // Marmara kampüs zemin katmanı
        map.addSource('campus-ground', {
          type: 'geojson',
          data: boundary,
        })

        const firstLineLayer = map
          .getStyle()
          .layers.find((layer) => layer.type === 'line')

        map.addLayer(
          {
            id: 'campus-ground-fill',
            type: 'fill',
            source: 'campus-ground',
            paint: {
              'fill-color': campusColors.campusGround,
              'fill-opacity': 0.68,
            },
          },
          firstLineLayer?.id
        )






        // Çevre binalarını her zoom seviyesinde göster.
        if (map.getLayer('outside-buildings-3d')) {
          map.setLayoutProperty(
            'outside-buildings-3d',
            'visibility',
            'visible'
          )

          map.setLayerZoomRange('outside-buildings-3d', 0, 24)

          map.setPaintProperty(
            'outside-buildings-3d',
            'fill-extrusion-opacity',
            0.95
          )
        }

        map.addLayer({
          id: 'outside-buildings-2d',
          type: 'fill',
          source: 'outside-buildings',
          layout: { visibility: 'none' },
          paint: {
            'fill-color': campusColors.surroundings,
            'fill-opacity': 0.92,
            'fill-outline-color': '#aeb5b7',
          },
        })

        map.addSource('campus-buildings', {
          type: 'geojson',
          data,
          promoteId: 'buildingKey',
        })

        map.addLayer({
          id: 'campus-building-2d',
          type: 'fill',
          source: 'campus-buildings',
          layout: { visibility: 'none' },
          paint: {
            'fill-color': campusColors.building,
            'fill-opacity': 0.96,
            'fill-outline-color': '#5b87aa',
          },
        })

        map.addLayer({
          id: 'campus-building-fill',
          type: 'fill-extrusion',
          source: 'campus-buildings',
          paint: {
            'fill-extrusion-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              campusColors.building,
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

        // Kullanıcı veri yüklenirken görünümü değiştirmiş olabilir.
        const initial3d = mapModeRef.current === '3d'
        for (const [layerId, visible] of [
          ['campus-building-fill', initial3d],
          ['campus-building-2d', !initial3d],
          ['outside-buildings-3d', initial3d],
          ['outside-buildings-2d', !initial3d],
        ]) {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
          }
        }

        // Kullanıcı rota isteyene kadar katmanlar boş kalır.
        const emptyRoutes = { type: 'FeatureCollection', features: [] }
        map.addSource('campus-route', { type: 'geojson', data: emptyRoutes })
        map.addLayer({
          id: 'campus-route-outline', type: 'line', source: 'campus-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': .94 },
        })
        map.addLayer({
          id: 'campus-route-line', type: 'line', source: 'campus-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#1769e0', 'line-width': 6, 'line-opacity': .98 },
        })
        map.addSource('campus-route-points', { type: 'geojson', data: emptyRoutes })
        map.addLayer({
          id: 'campus-route-markers', type: 'circle', source: 'campus-route-points',
          paint: {
            'circle-radius': 8,
            'circle-color': ['match', ['get', 'point'], 0, '#15a47d', '#1769e0'],
            'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3,
          },
        })

        // Kaydedilen inceleme durumlarını haritaya uygula.
        for (const [id, value] of Object.entries(mergedOverrides)) {
          if (!seenIds.has(id)) continue

          map.setFeatureState(
            { source: 'campus-buildings', id },
            { reviewStatus: value.status || 'unreviewed' }
          )
        }

        for (const layerId of ['campus-building-fill', 'campus-building-2d']) {
          map.on('click', layerId, (event) => {
            const feature = event.features?.[0]
            if (!feature) return

            selectBuilding(feature.id, true)
          })
        }

        map.on('click', (event) => {
          const buildings = map.queryRenderedFeatures(event.point, {
            layers: ['campus-building-fill', 'campus-building-2d'],
          })

          if (buildings.length === 0) {
            closeCard()
          }
        })

        for (const layerId of ['campus-building-fill', 'campus-building-2d']) {
          map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer'
          })

          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = ''
          })
        }

        setBuildingFeatures(features)
        setBuildingCount(features.length)

        console.log(`✅ ${features.length} kampüs binası yüklendi.`)
      } catch (err) {
        if (!cancelled) {
          console.error('Bina yükleme hatası:', err)
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
      featuresRef.current = new Map()
      routeGraphRef.current = null
      activeRouteIdRef.current = null
    }
  }, [])

  // Düzenleme modunda doğrulama renklerini göster.
  // buildingFeatures bağımlılığı, katman yüklenince de çalışmasını sağlar.
  useEffect(() => {
    const map = mapRef.current

    if (!map?.getLayer('campus-building-fill')) return

    const colorExpression = editMode
      ? [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          campusColors.building,

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

    if (map.getLayer('campus-building-fill')) {
      map.setPaintProperty(
        'campus-building-fill',
        'fill-extrusion-color',
        colorExpression
      )
    }

    if (map.getLayer('campus-building-2d')) {
      map.setPaintProperty(
        'campus-building-2d',
        'fill-color',
        colorExpression
      )
    }
  }, [editMode, buildingFeatures])

  useEffect(() => {
    const map = mapRef.current

    if (!map?.getSource('campus-buildings')) return

    for (const [id, value] of Object.entries(overrides)) {
      if (!featuresRef.current.has(String(id))) continue

      map.setFeatureState(
        { source: 'campus-buildings', id },
        { reviewStatus: value.status || 'unreviewed' }
      )
    }
  }, [overrides, buildingFeatures])


  // Bina etiketlerini yükle ve isim değişikliklerinde güncelle.
  useEffect(() => {
    const map = mapRef.current

    if (!map?.getLayer('campus-building-fill')) return
    if (!buildingFeatures.length) return

    syncBuildingLabels(map, buildingFeatures, overrides)
  }, [buildingFeatures, overrides])

  function closeCard() {
    clearRoute()
    // Kamera geri dönüşü v0.9.3
    mapRef.current?.flyTo({
      ...HOME_CAMERA,
      pitch: mapModeRef.current === '3d' ? HOME_CAMERA.pitch : 0,
      bearing: mapModeRef.current === '3d' ? HOME_CAMERA.bearing : 0,
      duration: CAMERA_ANIMATION_DURATION,
    })


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

  function changeMapMode(nextMode) {
    if (nextMode === mapModeRef.current) return

    mapModeRef.current = nextMode
    setMapMode(nextMode)

    const map = mapRef.current
    if (!map) return

    const is3d = nextMode === '3d'
    const visibility = (visible) => (visible ? 'visible' : 'none')

    for (const [layerId, visible] of [
      ['campus-building-fill', is3d],
      ['campus-building-2d', !is3d],
      ['outside-buildings-3d', is3d],
      ['outside-buildings-2d', !is3d],
    ]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility(visible))
      }
    }

    map.easeTo({
      pitch: is3d ? HOME_CAMERA.pitch : 0,
      bearing: is3d ? HOME_CAMERA.bearing : 0,
      duration: CAMERA_ANIMATION_DURATION,
    })
  }

  function saveBuilding(id, changes) {
    const next = {
      ...overridesRef.current,
      [id]: changes,
    }

    delete next['0']

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (err) {
      console.error(err)
      setError('Değişiklikler tarayıcıya kaydedilemedi.')
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

      <div className="map-mode-switch" role="group" aria-label="Harita görünümü">
        <button
          type="button"
          className={mapMode === '2d' ? 'map-mode-button active' : 'map-mode-button'}
          aria-pressed={mapMode === '2d'}
          onClick={() => changeMapMode('2d')}
        >
          2D harita
        </button>
        <button
          type="button"
          className={mapMode === '3d' ? 'map-mode-button active' : 'map-mode-button'}
          aria-pressed={mapMode === '3d'}
          onClick={() => changeMapMode('3d')}
        >
          3D maket
        </button>
      </div>

      <SearchPanel
        buildings={searchableBuildings}
        onSelect={(id) => selectBuilding(id, true)}
        loading={buildingCount === null}
        animationsEnabled={animationsEnabled}
      />

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

      <button
        type="button"
        className="motion-toggle"
        aria-pressed={animationsEnabled}
        onClick={toggleAnimations}
        title="Panel animasyonlarını aç veya kapat"
      >
        Animasyon: {animationsEnabled ? 'Açık' : 'Kapalı'}
      </button>

      <div className="map-status">
        <span className="status-dot" />

        {error
          ? `Hata: ${error}`
          : buildingCount === null
            ? 'Binalar yükleniyor...'
            : `${buildingCount} bina · Prototip v0.9`}
      </div>

      {selectedBuilding && editMode ? (
        <BuildingEditor
          key={selectedBuilding.id}
          building={selectedBuilding}
          poiList={poiList}
          onSave={saveBuilding}
          onClose={closeCard}
        />
      ) : visibleBuilding && !editMode ? (
        <section
          className="building-card"
          data-motion={animationsEnabled ? (cardExiting ? 'exit' : 'enter') : 'off'}
          aria-hidden={cardExiting}
          inert={cardExiting ? true : undefined}
        >
          <button
            type="button"
            className="card-close"
            onClick={closeCard}
            aria-label="Kartı kapat"
          >
            ×
          </button>

          <div className="card-label">SEÇİLEN BİNA</div>

          <h2>{visibleBuilding.name}</h2>

          {visibleBuilding.units.length > 0 ? (
            <>
              <p className="card-description">
                Bu binayla ilişkilendirilen birimler
              </p>

              <div className="unit-list">
                {visibleBuilding.units.map((unit, index) => (
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
              Bu binayla ilişkilendirilmiş birim bulunmuyor.
            </p>
          )}
          {!cardExiting && (
            <div className="route-actions">
              {routeInfo && activeRouteIdRef.current === String(visibleBuilding.id) ? (
                <>
                  <button type="button" className="route-action route-stop" onClick={clearRoute}>
                    × Rotayı kapat
                  </button>
                  <p className="route-summary">
                    <strong>🚶 {routeInfo.meters} m</strong>
                    <span>Yaklaşık {routeInfo.minutes} dk yürüyüş</span>
                  </p>
                </>
              ) : (
                <button type="button" className="route-action" onClick={showRoute}>
                  ↗ A Kapısı'ndan yol tarifi
                </button>
              )}
              {routeError && <p className="route-notice route-error" role="status">{routeError}</p>}
              <p className="route-notice">Prototip rota · OSM yolları kullanılır, bina girişleri yaklaşık.</p>
            </div>
          )}
        </section>
      ) : null}
    </main>
  )
}

export default App