// Göztepe Kampüsü görsel tasarım sistemi

export const campusColors = {
  background: '#f5f2e9',
  park: '#dce9d4',
  water: '#bcdfe7',
  road: '#ffffff',

  building: '#d8c9ec',
  buildingOutline: '#ad98ce',

  selected: '#7952cc',
}

// OpenFreeMap'in mevcut katmanlarını sadeleştirir.
// Gerçek coğrafi verileri değiştirmez.

export function applyCampusStyle(map) {
  const style = map.getStyle()

  if (!style?.layers) return

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase()
    

    // Haritanın kendi metin etiketlerini gizle.
    // Böylece bina isimlerini daha sonra biz yerleştirebiliriz.
    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
      continue
    }

    // Genel zemin
    if (layer.type === 'background') {
      map.setPaintProperty(
        layer.id,
        'background-color',
        campusColors.background
      )
    }

    // Yeşil alanlar
    if (
      layer.type === 'fill' &&
      /park|grass|wood|forest|landcover/.test(id)
    ) {
      map.setPaintProperty(
        layer.id,
        'fill-color',
        campusColors.park
      )
    }

    // Deniz ve su alanları
    if (
      layer.type === 'fill' &&
      /water/.test(id)
    ) {
      map.setPaintProperty(
        layer.id,
        'fill-color',
        campusColors.water
      )
    }

    // Yol çizgileri
    if (
      layer.type === 'line' &&
      /road|street|highway/.test(id)
    ) {
      map.setPaintProperty(
        layer.id,
        'line-color',
        campusColors.road
      )
    }
  }
}