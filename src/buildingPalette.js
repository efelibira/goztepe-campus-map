const BUILDING_COLORS = [
  '#75B8F2',
  '#92C9F4',
  '#76CFCB',
  '#94D7B8',
  '#B3A5EA',
  '#C6AFE8',
  '#F0BEA6',
  '#ECAFAF',
]

export function getBuildingColor(id) {
  const text = String(id)
  let hash = 2166136261

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return BUILDING_COLORS[
    (hash >>> 0) % BUILDING_COLORS.length
  ]
}
