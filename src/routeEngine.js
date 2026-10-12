// Prototip rota motoru: OSM yol geometrisi üzerinde A*.
// Bina kapıları henüz doğrulanmadığından son bağlantı bina sınırına yaklaşık çizilir.
const GATE_ID = 'osm:way/1020362430'
const R = Math.PI / 180
const pointKey = ([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`

function meters(a, b) {
  const dy = (b[1] - a[1]) * 111195
  const dx = (b[0] - a[0]) * 111195 * Math.cos((a[1] + b[1]) / 2 * R)
  return Math.hypot(dx, dy)
}

function nearestRoadNode(graph, location, component = null) {
  let best = null
  let distance = Infinity
  for (const node of graph.nodes.values()) {
    if (component !== null && node.component !== component) continue
    const d = meters(location, node.coord)
    if (d < distance) { best = node; distance = d }
  }
  return { node: best, distance }
}

function firstRing(feature) {
  const geom = feature?.geometry
  if (geom?.type === 'Polygon') return geom.coordinates[0]
  if (geom?.type === 'MultiPolygon') return geom.coordinates[0]?.[0]
  return null
}

function geometryCenter(feature) {
  const ring = firstRing(feature)
  if (!ring?.length) return null
  const points = ring.slice(0, -1)
  return [points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length]
}

// En yakın yürüyüş yolu düğümüne göre bina poligonunun en yakın sınır noktası.
function boundaryPoint(feature, roadPoint) {
  const ring = firstRing(feature)
  if (!ring?.length) return geometryCenter(feature)
  const origin = geometryCenter(feature)
  const sx = 111195 * Math.cos(origin[1] * R)
  const sy = 111195
  const px = (roadPoint[0] - origin[0]) * sx
  const py = (roadPoint[1] - origin[1]) * sy
  let best = null, bestSq = Infinity
  for (let i = 0; i < ring.length - 1; i++) {
    const a = [(ring[i][0] - origin[0]) * sx, (ring[i][1] - origin[1]) * sy]
    const b = [(ring[i + 1][0] - origin[0]) * sx, (ring[i + 1][1] - origin[1]) * sy]
    const vx = b[0] - a[0], vy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy || 1)))
    const x = a[0] + t * vx, y = a[1] + t * vy
    const d = (x - px) ** 2 + (y - py) ** 2
    if (d < bestSq) { bestSq = d; best = [origin[0] + x / sx, origin[1] + y / sy] }
  }
  return best
}

export function buildWalkingGraph(geojson) {
  const nodes = new Map()
  const getNode = (coord) => {
    const key = pointKey(coord)
    if (!nodes.has(key)) nodes.set(key, { key, coord, edges: [], component: -1 })
    return nodes.get(key)
  }
  for (const feature of geojson.features || []) {
    if (feature.geometry?.type !== 'LineString') continue
    const props = feature.properties || {}
    if (['no', 'private'].includes(props.foot) || props.access === 'private') continue
    const pts = feature.geometry.coordinates
    for (let i = 1; i < pts.length; i++) {
      const a = getNode(pts[i - 1]), b = getNode(pts[i])
      if (a.key === b.key) continue
      const length = meters(a.coord, b.coord)
      a.edges.push([b.key, length])
      b.edges.push([a.key, length])
    }
  }
  let component = 0
  for (const node of nodes.values()) {
    if (node.component !== -1) continue
    node.component = component
    const queue = [node]
    for (let i = 0; i < queue.length; i++) {
      for (const [key] of queue[i].edges) {
        const next = nodes.get(key)
        if (next.component === -1) { next.component = component; queue.push(next) }
      }
    }
    component++
  }
  return { nodes, componentCount: component }
}

// 631 OSM yolu için doğrusal açık küme taraması yeterince hızlı.
export function findWalkingRoute(graph, features, targetId) {
  if (!graph?.nodes?.size) throw new Error('Yürüyüş yolu verisi hazır değil.')
  const gate = features.get(GATE_ID)
  const target = features.get(String(targetId))
  if (!gate) throw new Error('A Kapısı veride bulunamadı.')
  if (!target) throw new Error('Hedef bina bulunamadı.')
  const gateCenter = geometryCenter(gate)
  const targetCenter = geometryCenter(target)
  if (!gateCenter || !targetCenter) throw new Error('Bina geometrisi okunamadı.')
  const start = nearestRoadNode(graph, gateCenter)
  const end = nearestRoadNode(graph, targetCenter, start.node?.component)
  if (!start.node || !end.node || start.distance > 65 || end.distance > 80) {
    throw new Error('Bu binaya bağlı yürüyüş yolu bulunamadı.')
  }
  const distances = new Map([[start.node.key, 0]])
  const previous = new Map()
  const visited = new Set()
  const queue = [[meters(start.node.coord, end.node.coord), start.node.key]]
  // Küçük min-heap (düğümler en çok birkaç bin adet).
  function push(item) {
    queue.push(item); let i = queue.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (queue[parent][0] <= item[0]) break
      queue[i] = queue[parent]; i = parent
    }
    queue[i] = item
  }
  function pop() {
    const top = queue[0], last = queue.pop()
    if (queue.length) {
      let i = 0
      while (i * 2 + 1 < queue.length) {
        let c = i * 2 + 1
        if (c + 1 < queue.length && queue[c + 1][0] < queue[c][0]) c++
        if (queue[c][0] >= last[0]) break
        queue[i] = queue[c]; i = c
      }
      queue[i] = last
    }
    return top
  }
  while (queue.length) {
    const [, key] = pop()
    if (visited.has(key)) continue
    visited.add(key)
    if (key === end.node.key) break
    const current = graph.nodes.get(key)
    for (const [neighbor, length] of current.edges) {
      const cost = distances.get(key) + length
      if (cost < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, cost)
        previous.set(neighbor, key)
        push([cost + meters(graph.nodes.get(neighbor).coord, end.node.coord), neighbor])
      }
    }
  }
  if (!distances.has(end.node.key)) throw new Error('Yürüyüş yolları arasında bağlantı bulunamadı.')
  const path = []
  let key = end.node.key
  while (key !== undefined) { path.push(graph.nodes.get(key).coord); key = previous.get(key) }
  path.reverse()
  const startPoint = boundaryPoint(gate, start.node.coord)
  const endPoint = boundaryPoint(target, end.node.coord)
  const coordinates = [startPoint, ...path, endPoint]
  const distance = distances.get(end.node.key) + meters(startPoint, start.node.coord) + meters(end.node.coord, endPoint)
  return {
    coordinates,
    start: startPoint,
    end: endPoint,
    meters: Math.round(distance),
    minutes: Math.max(1, Math.round(distance / 75)),
  }
}
