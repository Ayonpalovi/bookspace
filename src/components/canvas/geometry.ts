import type { Anchor, Point, Rect, SpaceObject, Viewport } from '@/types/canvas'

/* ------------------------------------------------------------ coordinates */

/** Screen pixel → canvas coordinate. */
export function toCanvas(
  screen: Point,
  rect: { left: number; top: number },
  viewport: Viewport,
): Point {
  return {
    x: (screen.x - rect.left) / viewport.zoom + viewport.x,
    y: (screen.y - rect.top) / viewport.zoom + viewport.y,
  }
}

/** Canvas coordinate → screen pixel, relative to the stage element. */
export function toScreen(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) * viewport.zoom,
    y: (point.y - viewport.y) * viewport.zoom,
  }
}

/* ----------------------------------------------------------------- bounds */

export function objectRect(object: SpaceObject): Rect {
  return { x: object.x, y: object.y, width: object.width, height: object.height }
}

export function boundsOf(objects: SpaceObject[]): Rect | null {
  if (!objects.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const object of objects) {
    minX = Math.min(minX, object.x)
    minY = Math.min(minY, object.y)
    maxX = Math.max(maxX, object.x + object.width)
    maxY = Math.max(maxY, object.y + object.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/** Even-odd point-in-polygon, used by the lasso tool. */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** A lasso selects an object when the object's centre falls inside it. */
export function lassoSelects(polygon: Point[], object: SpaceObject): boolean {
  return pointInPolygon(
    { x: object.x + object.width / 2, y: object.y + object.height / 2 },
    polygon,
  )
}

/* ------------------------------------------------------------- connectors */

export function anchorPoint(rect: Rect, anchor: Anchor): Point {
  switch (anchor) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    default:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }
}

/**
 * Picks the side of `rect` facing `towards`, so an 'auto' connector stays
 * sensible as the objects it joins are dragged around each other.
 */
export function autoAnchor(rect: Rect, towards: Point): Anchor {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const dx = towards.x - cx
  const dy = towards.y - cy
  if (Math.abs(dx) * rect.height > Math.abs(dy) * rect.width) {
    return dx > 0 ? 'right' : 'left'
  }
  return dy > 0 ? 'bottom' : 'top'
}

export function resolveConnectorEnds(
  connector: SpaceObject,
  byId: Map<string, SpaceObject>,
): { from: Point; to: Point } | null {
  const content = connector.content as {
    fromId?: string | null
    toId?: string | null
    fromAnchor?: Anchor
    toAnchor?: Anchor
    fromPoint?: Point
    toPoint?: Point
  }
  const fromObject = content.fromId ? byId.get(content.fromId) : undefined
  const toObject = content.toId ? byId.get(content.toId) : undefined

  // An endpoint is either bound to an object or pinned to a free point.
  if (!fromObject && !content.fromPoint) return null
  if (!toObject && !content.toPoint) return null

  const fromRect = fromObject ? objectRect(fromObject) : null
  const toRect = toObject ? objectRect(toObject) : null

  const toCentre = toRect
    ? { x: toRect.x + toRect.width / 2, y: toRect.y + toRect.height / 2 }
    : content.toPoint!
  const fromCentre = fromRect
    ? { x: fromRect.x + fromRect.width / 2, y: fromRect.y + fromRect.height / 2 }
    : content.fromPoint!

  const from = fromRect
    ? anchorPoint(
        fromRect,
        content.fromAnchor && content.fromAnchor !== 'auto'
          ? content.fromAnchor
          : autoAnchor(fromRect, toCentre),
      )
    : content.fromPoint!
  const to = toRect
    ? anchorPoint(
        toRect,
        content.toAnchor && content.toAnchor !== 'auto'
          ? content.toAnchor
          : autoAnchor(toRect, fromCentre),
      )
    : content.toPoint!

  return { from, to }
}

export function connectorPath(
  from: Point,
  to: Point,
  shape: 'straight' | 'elbow' | 'curved' = 'straight',
): string {
  if (shape === 'straight') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  if (shape === 'elbow') {
    const midX = (from.x + to.x) / 2
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`
  }
  const dx = Math.abs(to.x - from.x) * 0.5
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

/** Where the label sits on a connector, following the path's actual shape. */
export function connectorLabelPoint(
  from: Point,
  to: Point,
  shape: 'straight' | 'elbow' | 'curved' = 'straight',
  t = 0.5,
): Point {
  if (shape === 'elbow') {
    // The elbow's long middle leg is the readable stretch.
    const midX = (from.x + to.x) / 2
    return { x: midX, y: from.y + (to.y - from.y) * t }
  }
  if (shape === 'curved') {
    const dx = Math.abs(to.x - from.x) * 0.5
    const c1 = { x: from.x + dx, y: from.y }
    const c2 = { x: to.x - dx, y: to.y }
    const u = 1 - t
    return {
      x: u ** 3 * from.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * to.x,
      y: u ** 3 * from.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * to.y,
    }
  }
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

/** The connection point on `rect` closest to `point`, for snap-to-anchor. */
export function nearestAnchor(
  rect: Rect,
  point: Point,
): { anchor: Anchor; point: Point; distance: number } {
  const candidates: Anchor[] = ['top', 'right', 'bottom', 'left']
  let best = { anchor: 'auto' as Anchor, point: anchorPoint(rect, 'auto'), distance: Infinity }
  for (const anchor of candidates) {
    const candidate = anchorPoint(rect, anchor)
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
    if (distance < best.distance) best = { anchor, point: candidate, distance }
  }
  return best
}

/**
 * The topmost object under a canvas point, ignoring `exclude`.
 *
 * Connector targeting hit-tests geometrically rather than via the DOM so it
 * also finds frames, whose bodies are deliberately click-through.
 */
export function objectAt(
  point: Point,
  objects: SpaceObject[],
  exclude?: string,
): SpaceObject | null {
  let found: SpaceObject | null = null
  for (const object of objects) {
    if (object.id === exclude || object.hidden || object.type === 'connector') continue
    if (!pointInRect(point, objectRect(object))) continue
    // Prefer the object drawn on top, but never a frame over its contents.
    if (
      !found ||
      (found.type === 'frame' && object.type !== 'frame') ||
      (found.type !== 'frame' && object.type !== 'frame' && object.zIndex >= found.zIndex)
    ) {
      found = object
    }
  }
  return found
}

/** Closest object whose edge is within `radius` of the given rect. */
export function nearestNeighbour(
  rect: Rect,
  objects: SpaceObject[],
  exclude: Set<string>,
  radius: number,
): SpaceObject | null {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  let best: { object: SpaceObject; distance: number } | null = null
  for (const object of objects) {
    if (exclude.has(object.id) || object.type === 'connector' || object.hidden) continue
    if (object.type === 'frame') continue
    const other = objectRect(object)
    // Gap between the two rectangles, zero when they overlap.
    const dx = Math.max(other.x - (rect.x + rect.width), rect.x - (other.x + other.width), 0)
    const dy = Math.max(other.y - (rect.y + rect.height), rect.y - (other.y + other.height), 0)
    const gap = Math.hypot(dx, dy)
    if (gap > radius) continue
    const otherCentre = { x: other.x + other.width / 2, y: other.y + other.height / 2 }
    const distance = Math.hypot(otherCentre.x - centre.x, otherCentre.y - centre.y)
    if (!best || distance < best.distance) best = { object, distance }
  }
  return best?.object ?? null
}

/* -------------------------------------------------------------- snapping */

export interface SnapGuide {
  axis: 'x' | 'y'
  position: number
  /** Canvas-space extent of the guide line, for drawing. */
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

const SNAP_TOLERANCE = 6

/**
 * Aligns the dragged bounds to nearby objects' edges and centres.
 * Tolerance is in screen pixels, converted to canvas units, so snapping feels
 * the same whether the user is zoomed in or out.
 */
export function computeSnap(
  moving: Rect,
  others: SpaceObject[],
  zoom: number,
  gridSize: number | null,
): SnapResult {
  const tolerance = SNAP_TOLERANCE / zoom
  const guides: SnapGuide[] = []
  let dx = 0
  let dy = 0
  let bestX = tolerance
  let bestY = tolerance

  const movingX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const movingY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]

  for (const other of others) {
    const rect = objectRect(other)
    const targetX = [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
    const targetY = [rect.y, rect.y + rect.height / 2, rect.y + rect.height]

    for (const mx of movingX) {
      for (const tx of targetX) {
        const delta = tx - mx
        if (Math.abs(delta) <= bestX) {
          bestX = Math.abs(delta)
          dx = delta
          guides.push({
            axis: 'x',
            position: tx,
            from: Math.min(rect.y, moving.y) - 24,
            to: Math.max(rect.y + rect.height, moving.y + moving.height) + 24,
          })
        }
      }
    }
    for (const my of movingY) {
      for (const ty of targetY) {
        const delta = ty - my
        if (Math.abs(delta) <= bestY) {
          bestY = Math.abs(delta)
          dy = delta
          guides.push({
            axis: 'y',
            position: ty,
            from: Math.min(rect.x, moving.x) - 24,
            to: Math.max(rect.x + rect.width, moving.x + moving.width) + 24,
          })
        }
      }
    }
  }

  // Grid snapping only applies where object snapping found nothing better.
  if (gridSize) {
    if (dx === 0) {
      const snapped = Math.round(moving.x / gridSize) * gridSize - moving.x
      if (Math.abs(snapped) <= tolerance) dx = snapped
    }
    if (dy === 0) {
      const snapped = Math.round(moving.y / gridSize) * gridSize - moving.y
      if (Math.abs(snapped) <= tolerance) dy = snapped
    }
  }

  return {
    dx,
    dy,
    guides: guides.filter(
      (guide) =>
        (guide.axis === 'x' && Math.abs(guide.position - (moving.x + dx)) < 0.01) ||
        (guide.axis === 'x' &&
          Math.abs(guide.position - (moving.x + dx + moving.width / 2)) < 0.01) ||
        (guide.axis === 'x' &&
          Math.abs(guide.position - (moving.x + dx + moving.width)) < 0.01) ||
        (guide.axis === 'y' && Math.abs(guide.position - (moving.y + dy)) < 0.01) ||
        (guide.axis === 'y' &&
          Math.abs(guide.position - (moving.y + dy + moving.height / 2)) < 0.01) ||
        (guide.axis === 'y' &&
          Math.abs(guide.position - (moving.y + dy + moving.height)) < 0.01),
    ),
  }
}

/* ------------------------------------------------------------- resize math */

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export function applyResize(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepAspect: boolean,
  minSize = 24,
): Rect {
  let { x, y, width, height } = start
  const aspect = start.width / Math.max(1, start.height)

  if (handle.includes('e')) width = start.width + dx
  if (handle.includes('s')) height = start.height + dy
  if (handle.includes('w')) {
    width = start.width - dx
    x = start.x + dx
  }
  if (handle.includes('n')) {
    height = start.height - dy
    y = start.y + dy
  }

  if (keepAspect && handle.length === 2) {
    if (Math.abs(width - start.width) > Math.abs(height - start.height)) {
      height = width / aspect
      if (handle.includes('n')) y = start.y + (start.height - height)
    } else {
      width = height * aspect
      if (handle.includes('w')) x = start.x + (start.width - width)
    }
  }

  if (width < minSize) {
    if (handle.includes('w')) x = start.x + start.width - minSize
    width = minSize
  }
  if (height < minSize) {
    if (handle.includes('n')) y = start.y + start.height - minSize
    height = minSize
  }

  return { x, y, width, height }
}

/** Fits a rect into a viewport of the given pixel size, with padding. */
export function fitViewport(
  bounds: Rect,
  viewportWidth: number,
  viewportHeight: number,
  padding = 80,
  maxZoom = 1.5,
): Viewport {
  const zoom = Math.min(
    maxZoom,
    Math.max(
      0.05,
      Math.min(
        (viewportWidth - padding * 2) / Math.max(1, bounds.width),
        (viewportHeight - padding * 2) / Math.max(1, bounds.height),
      ),
    ),
  )
  return {
    zoom,
    x: bounds.x + bounds.width / 2 - viewportWidth / (2 * zoom),
    y: bounds.y + bounds.height / 2 - viewportHeight / (2 * zoom),
  }
}

/** Simplifies a freehand stroke — Ramer–Douglas–Peucker. */
export function simplifyStroke(points: Point[], tolerance = 1.2): Point[] {
  if (points.length < 3) return points
  const sqTolerance = tolerance * tolerance

  const sqSegDist = (p: Point, a: Point, b: Point) => {
    let x = a.x
    let y = a.y
    let dx = b.x - x
    let dy = b.y - y
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = b.x
        y = b.y
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }
    dx = p.x - x
    dy = p.y - y
    return dx * dx + dy * dy
  }

  const simplify = (pts: Point[], first: number, last: number, out: Point[]) => {
    let maxDist = sqTolerance
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const dist = sqSegDist(pts[i], pts[first], pts[last])
      if (dist > maxDist) {
        index = i
        maxDist = dist
      }
    }
    if (index > -1) {
      if (index - first > 1) simplify(pts, first, index, out)
      out.push(pts[index])
      if (last - index > 1) simplify(pts, index, last, out)
    }
  }

  // The recursion appends left-to-right, so the result is already in order.
  const result: Point[] = [points[0]]
  simplify(points, 0, points.length - 1, result)
  result.push(points[points.length - 1])
  return result
}

/** Converts a stroke to an SVG path in the drawing object's local space. */
export function strokePath(points: Point[]): string {
  if (!points.length) return ''
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2
    const midY = (points[i].y + points[i + 1].y) / 2
    path += ` Q ${points[i].x} ${points[i].y}, ${midX} ${midY}`
  }
  const last = points[points.length - 1]
  path += ` L ${last.x} ${last.y}`
  return path
}
