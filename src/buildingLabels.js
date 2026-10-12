import { centroid } from '@turf/centroid'

const SOURCE_ID = 'campus-building-labels'
const MAJOR_LAYER = 'campus-labels-major'
const DETAIL_LAYER = 'campus-labels-detail'

function isMajor(name) {
  return /fakülte|rektörlük|kütüphane|enstitü|yüksekokul|yemekhane|amfi|konferans|spor salonu/i.test(name)
}

function makeLabelData(features, overrides) {
  const labels = []

  for (const feature of features) {
    const properties = feature.properties || {}
    const override = overrides[feature.id] || {}

    const name = String(
      override.name ??
      properties.name ??
      ''
    ).trim()

    if (
      !name ||
      name === 'Henüz isimlendirilmemiş bina' ||
      name === 'İsimsiz bina'
    ) {
      continue
    }

    try {
      const point = centroid(feature)

      labels.push({
        type: 'Feature',
        geometry: point.geometry,
        properties: {
          buildingId: String(feature.id),
          label: name,
          major: isMajor(name),
        },
      })
    } catch (error) {
      console.warn('Etiket konumu oluşturulamadı:', feature.id, error)
    }
  }

  return {
    type: 'FeatureCollection',
    features: labels,
  }
}

export function syncBuildingLabels(map, features, overrides) {
  if (!map || !features.length) return

  // MapLibre 6: Sunucudaki PBF fontları yerine
  // tarayıcı tarafından yüklenen web fontunu kullan.
  if (map.getStyle()?.glyphs) {
    map.setGlyphs(null)
  }

  const data = makeLabelData(features, overrides)

  // Web fontu yüklenince etiketleri yeniden oluştur.
  document.fonts
    .load("500 14px 'Google Sans Flex'")
    .then(() => {
      if (map.getSource(SOURCE_ID)) {
        map.getSource(SOURCE_ID).setData(data)
      }
    })
    .catch((error) => {
      console.warn('Harita fontu yüklenemedi:', error)
    })

  const existingSource = map.getSource(SOURCE_ID)

  if (existingSource) {
    existingSource.setData(data)
    return
  }

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data,
  })

  const sharedLayout = {
    'text-field': ['get', 'label'],
    'text-font': ['Google Sans Flex', 'Arial', 'sans-serif'],
    'text-size': [
      'interpolate',
      ['linear'],
      ['zoom'],
      15, 11,
      19, 15,
    ],
    'text-max-width': 13,
    'text-line-height': 1.2,
    'text-anchor': 'center',
    'text-variable-anchor': [
      'top',
      'bottom',
      'left',
      'right',
    ],
    'text-radial-offset': 0.5,
    'text-allow-overlap': false,
    'text-ignore-placement': false,
    'text-optional': false,
  }

  const sharedPaint = {
    'text-color': '#334A5F',
    'text-halo-color': '#FFFFFF',
    'text-halo-width': 1.7,
    'text-halo-blur': 0.4,
  }

  // Daha uzaktan önemli binalar görünür.
  map.addLayer({
    id: MAJOR_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 15.5,
    filter: ['==', ['get', 'major'], true],
    layout: sharedLayout,
    paint: sharedPaint,
  })

  // Yakınlaşınca diğer isimler de görünür.
  map.addLayer({
    id: DETAIL_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    minzoom: 17.2,
    filter: ['==', ['get', 'major'], false],
    layout: {
      ...sharedLayout,
      'text-size': 12,
    },
    paint: sharedPaint,
  })
}
