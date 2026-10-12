import fs from 'node:fs'

const input = 'public/data/goztepe-buildings-matched.geojson'
const output = 'public/data/goztepe-buildings-3d.geojson'

const data = JSON.parse(fs.readFileSync(input, 'utf8'))

let estimated = 0
let fromLevels = 0

for (const building of data.features) {
  const properties = building.properties || {}

  const levels = Number(properties['building:levels'])

  let displayHeight
  let heightSource

  if (Number.isFinite(levels) && levels > 0) {
    displayHeight = levels * 3
    heightSource = 'osm-levels'
    fromLevels++
  } else {
    displayHeight = 12
    heightSource = 'placeholder'
    estimated++
  }

  building.properties = {
    ...properties,
    displayHeight,
    heightSource,
  }
}

fs.writeFileSync(output, JSON.stringify(data, null, 2))

console.log(`Toplam bina: ${data.features.length}`)
console.log(`Kat sayısından hesaplanan: ${fromLevels}`)
console.log(`Geçici yükseklik kullanılan: ${estimated}`)
console.log(`Oluşturulan dosya: ${output}`)