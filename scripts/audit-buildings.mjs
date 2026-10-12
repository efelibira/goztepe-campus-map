import fs from 'node:fs'
import path from 'node:path'

const input = 'public/data/goztepe-buildings-matched.geojson'
const outputDir = 'reports'
const output = path.join(outputDir, 'building-audit.csv')

const data = JSON.parse(fs.readFileSync(input, 'utf8'))

fs.mkdirSync(outputDir, { recursive: true })

// CSV içinde virgül, tırnak ve satır sonlarını güvenle sakla.
function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

// GeoJSON özellikleri bazen dizi, bazen JSON metni olabilir.
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

const rows = data.features.map((building, index) => {
  const properties = building.properties || {}
  const units = parseUnits(properties.marmaraUnits)

  const osmName = properties.name || ''

  const unitNames = units
    .map((unit) => unit.name)
    .filter(Boolean)

  const categories = [
    ...new Set(
      units.map((unit) => unit.category).filter(Boolean)
    ),
  ]

  const osmId =
    properties['@id'] ??
    properties.osm_id ??
    building.id ??
    `index-${index + 1}`

  return {
    buildingId: osmId,
    osmName,
    marmaraUnits: unitNames.join(' | '),
    categories: categories.join(' | '),
    matchCount: units.length,
    reviewStatus: 'Kontrol edilmedi',
    notes: '',
  }
})

// Önce eşleşen binalar, ardından eşleşmeyenler.
rows.sort((a, b) => {
  if (a.matchCount !== b.matchCount) {
    return b.matchCount - a.matchCount
  }

  return a.osmName.localeCompare(b.osmName, 'tr')
})

const headers = [
  'building_id',
  'osm_name',
  'marmara_units',
  'categories',
  'match_count',
  'review_status',
  'notes',
]

const csv = [
  headers.join(','),
  ...rows.map((row) =>
    [
      row.buildingId,
      row.osmName,
      row.marmaraUnits,
      row.categories,
      row.matchCount,
      row.reviewStatus,
      row.notes,
    ]
      .map(csvCell)
      .join(',')
  ),
].join('\n')

// UTF-8 BOM: Excel ve Numbers'da Türkçe karakterler için.
fs.writeFileSync(output, '\uFEFF' + csv, 'utf8')

const matched = rows.filter((row) => row.matchCount > 0)
const withoutMatches = rows.filter((row) => row.matchCount === 0)

console.log('\n===== BİNA DENETİM RAPORU =====')
console.log('Toplam bina:', rows.length)
console.log('Otomatik eşleşen bina:', matched.length)
console.log('Eşleşmeyen bina:', withoutMatches.length)

console.log('\n--- EŞLEŞEN BİNALAR ---')

for (const row of matched) {
  console.log(`\n${row.osmName || 'OSM adı yok'}`)
  console.log(`ID: ${row.buildingId}`)
  console.log(`Marmara: ${row.marmaraUnits}`)
}

console.log('\n✅ Rapor oluşturuldu:', output)