// Marmara Campus - Açık pastel harita

export const campusColors = {
  background: '#F2F1EC',
  land: '#F2F1EC',
  road: '#E1E8E5',
  roadOutline: '#B5C5C3',

  campusGround: '#E9EDE3',
  park: '#C9DEC8',
  grass: '#DDEBD7',
  sports: '#D7E4E8',
  water: '#C9E3EB',

  surroundings: '#C5C9CB',
  building: '#90CAF9',
  selected: '#2196F3',

  brand: '#0D47A1',
}

export function applyCampusStyle(map) {
  const layers = map.getStyle()?.layers || []

  for (const layer of layers) {
    const id = layer.id.toLowerCase()

    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
      continue
    }

    if (layer.type === 'background') {
      map.setPaintProperty(
        layer.id,
        'background-color',
        campusColors.background
      )
      continue
    }

    if (layer.type === 'fill') {
      // Arazi türünü yalnızca katman adından değil,
      // GeoJSON özelliklerinden de okuyabiliriz.
      const kind = [
        'downcase',
        [
          'to-string',
          [
            'coalesce',
            ['get', 'class'],
            ['get', 'type'],
            '',
          ],
        ],
      ]

      const color = [
        'match',
        kind,

        ['water', 'river', 'lake', 'sea', 'reservoir'],
        campusColors.water,

        ['park', 'garden', 'forest', 'wood'],
        campusColors.park,

        ['grass', 'meadow', 'village_green'],
        campusColors.grass,

        [
          'pitch',
          'stadium',
          'sports_centre',
          'recreation_ground',
          'playground',
        ],
        campusColors.sports,

        campusColors.land,
      ]

      if (/water|river|lake|sea/.test(id)) {
        map.setPaintProperty(
          layer.id,
          'fill-color',
          campusColors.water
        )
      } else if (/sport|pitch|stadium/.test(id)) {
        map.setPaintProperty(
          layer.id,
          'fill-color',
          campusColors.sports
        )
      } else if (/park|garden|forest|wood/.test(id)) {
        map.setPaintProperty(
          layer.id,
          'fill-color',
          campusColors.park
        )
      } else if (/grass|meadow/.test(id)) {
        map.setPaintProperty(
          layer.id,
          'fill-color',
          campusColors.grass
        )
      } else {
        map.setPaintProperty(
          layer.id,
          'fill-color',
          color
        )
      }

      continue
    }

    if (layer.type === 'line') {
      const isRoad =
        /road|street|highway|motorway|trunk|path/.test(id)

      const isOutline =
        /case|casing|outline/.test(id)

      map.setPaintProperty(
        layer.id,
        'line-color',
        isRoad
          ? isOutline
            ? campusColors.roadOutline
            : campusColors.road
          : '#C8D1CE'
      )
    }
  }
}
