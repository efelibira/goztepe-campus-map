import fs from 'node:fs'
import * as cheerio from 'cheerio'

const html = fs.readFileSync(
  'scripts/marmara-source.html',
  'utf8'
)

const $ = cheerio.load(html)

const features = []

$('a[data-campus][data-latitude][data-longitude]').each(
  (_, element) => {
    const item = $(element)

    const campus = item.attr('data-campus')

    if (campus !== 'Göztepe Yerleşkesi') {
      return
    }

    const name = item.text().trim()
    const category = item.attr('data-type') || 'Diğer'

    const latitude = Number(item.attr('data-latitude'))
    const longitude = Number(item.attr('data-longitude'))

    if (
      !name ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return
    }

    features.push({
      type: 'Feature',

      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },

      properties: {
        name,
        category,
        campus,
        website: item.attr('data-link') || null,
      },
    })
  }
)

const geojson = {
  type: 'FeatureCollection',
  features,
}

if (features.length === 0) {
  console.error('Göztepe konumları bulunamadı. HTML dosyasını kontrol et.')
  process.exit(1)
}

fs.writeFileSync(
  'public/data/goztepe-poi.geojson',
  JSON.stringify(geojson, null, 2)
)

console.log(`✅ ${features.length} konum çıkarıldı.`)

const categories = {}

for (const feature of features) {
  const category = feature.properties.category

  categories[category] = (categories[category] || 0) + 1
}

console.table(categories)