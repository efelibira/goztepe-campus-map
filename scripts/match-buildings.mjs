import fs from 'node:fs'
import { centroid } from '@turf/centroid'
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'

const readGeoJSON = (path) =>
  JSON.parse(fs.readFileSync(path, 'utf8'))

const buildings = readGeoJSON(
  'public/data/goztepe-buildings-raw.geojson'
)

const boundary = readGeoJSON(
  'public/data/goztepe-boundary.geojson'
)

const pois = readGeoJSON(
  'public/data/goztepe-poi.geojson'
)

const campusBoundary = boundary.features[0]

// 1. Kampüs sınırındaki binaları seç
const campusBuildings = buildings.features.filter((building) => {
  if (!['Polygon', 'MultiPolygon'].includes(building.geometry?.type)) {
    return false
  }

  return booleanPointInPolygon(
    centroid(building),
    campusBoundary
  )
})

// 2. Kampüs içindeki POI'leri seç
const campusPOIs = pois.features.filter((poi) =>
  booleanPointInPolygon(poi, campusBoundary)
)

// 3. POI'leri binalarla eşleştir
const matchedPOIIndexes = new Set()

const matchedBuildings = campusBuildings.map((building) => {
  const matches = []

  campusPOIs.forEach((poi, index) => {
    if (booleanPointInPolygon(poi, building)) {
      matches.push({
        name: poi.properties.name,
        category: poi.properties.category,
        website: poi.properties.website,
      })

      matchedPOIIndexes.add(index)
    }
  })

  return {
    ...building,
    properties: {
      ...building.properties,
      marmaraUnits: matches,
    },
  }
})

// 4. Eşleşmeyen konumlar
const unmatchedPOIs = campusPOIs.filter(
  (_, index) => !matchedPOIIndexes.has(index)
)

// 5. Dosyaları oluştur
fs.writeFileSync(
  'public/data/goztepe-buildings-matched.geojson',
  JSON.stringify({
    type: 'FeatureCollection',
    features: matchedBuildings,
  }, null, 2)
)

fs.writeFileSync(
  'public/data/goztepe-poi-unmatched.geojson',
  JSON.stringify({
    type: 'FeatureCollection',
    features: unmatchedPOIs,
  }, null, 2)
)

// 6. Sonuçları göster
const namedBuildings = matchedBuildings.filter(
  (building) => building.properties.marmaraUnits.length > 0
)

console.log('\n===== GÖZTEPE KAMPÜSÜ =====')

console.log('Ham bina sayısı:', buildings.features.length)
console.log('Kampüs içindeki binalar:', campusBuildings.length)

console.log('\nMarmara konumları:', pois.features.length)
console.log('Kampüs sınırındaki konumlar:', campusPOIs.length)

console.log('\nİsim eşleşen bina:', namedBuildings.length)
console.log('Bina içine düşen konum:', matchedPOIIndexes.size)
console.log('Eşleşmeyen konum:', unmatchedPOIs.length)

console.log('\n✅ Veriler oluşturuldu.')