import { centroid } from '@turf/centroid'
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'

export function excludeBaseBuildings(map, boundary, rawBuildings) {
  const campusBoundary = boundary.features[0]

  // OpenFreeMap'in kendi 3D binalarını gizle.
  // Yalnızca başlangıç stilindeki katmanlara müdahale ediyoruz.
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'fill-extrusion') {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
    }
  }

  // Kampüs dışındaki binaları seç.
  const outsideBuildings = rawBuildings.features.filter((building) => {
    const type = building.geometry?.type

    if (type !== 'Polygon' && type !== 'MultiPolygon') {
      return false
    }

    const center = centroid(building)

    return !booleanPointInPolygon(center, campusBoundary)
  })

  // Çevredeki binalara gösterim yüksekliği ekle.
  const buildings3D = outsideBuildings.map((building) => {
    const properties = building.properties || {}

    const height = Number(properties.height)
    const levels = Number(properties['building:levels'])

    const displayHeight =
      Number.isFinite(height) && height > 0
        ? height
        : Number.isFinite(levels) && levels > 0
          ? levels * 3
          : 12

    return {
      ...building,
      properties: {
        ...properties,
        displayHeight,
      },
    }
  })

  map.addSource('outside-buildings', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: buildings3D,
    },
  })

  // Çevredeki gri 3D binaları yeniden oluştur.
  map.addLayer({
    id: 'outside-buildings-3d',
    type: 'fill-extrusion',
    source: 'outside-buildings',

    paint: {
      'fill-extrusion-color': '#C5C9CB',

      'fill-extrusion-height': [
        'get',
        'displayHeight',
      ],

      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.95,
      'fill-extrusion-vertical-gradient': true,
    },
  })

  console.log(
    `${buildings3D.length} çevre binası oluşturuldu.`
  )
}