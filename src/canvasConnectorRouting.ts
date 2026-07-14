import type { CanvasConnectionSide } from './canvasNodeSpecRegistry'
import type { CanvasPoint } from './canvasSceneStore'
import type { ProjectCanvasEdgeRouting, ProjectCanvasNode } from './projectCanvas'

export type CanvasConnectorRoute =
  | { readonly kind: 'straight'; readonly points: readonly [CanvasPoint, CanvasPoint] }
  | { readonly kind: 'orthogonal'; readonly points: readonly CanvasPoint[] }
  | {
    readonly kind: 'curved'
    readonly points: readonly [CanvasPoint, CanvasPoint]
    readonly control1: CanvasPoint
    readonly control2: CanvasPoint
  }

const ROUTE_CLEARANCE = 20

/**
 * Routed connectors stay within this distance of their endpoint bounds. The
 * same limit lets SceneStore index routed edges without inspecting the scene
 * or executing renderer behavior on viewport-query hot paths.
 */
export const CANVAS_CONNECTOR_MAX_DETOUR = 256

function offsetForSide(point: CanvasPoint, side: CanvasConnectionSide, distance: number): CanvasPoint {
  if (side === 'top') return { x: point.x, y: point.y - distance }
  if (side === 'right') return { x: point.x + distance, y: point.y }
  if (side === 'bottom') return { x: point.x, y: point.y + distance }
  return { x: point.x - distance, y: point.y }
}

function segmentIntersectsNode(from: CanvasPoint, to: CanvasPoint, node: ProjectCanvasNode): boolean {
  const minX = node.x
  const maxX = node.x + node.width
  const minY = node.y
  const maxY = node.y + node.height
  if (from.y === to.y) {
    return from.y >= minY && from.y <= maxY
      && Math.max(Math.min(from.x, to.x), minX) <= Math.min(Math.max(from.x, to.x), maxX)
  }
  if (from.x !== to.x) return false
  return from.x >= minX && from.x <= maxX
    && Math.max(Math.min(from.y, to.y), minY) <= Math.min(Math.max(from.y, to.y), maxY)
}

function blockingNodes(points: readonly CanvasPoint[], obstacles: readonly ProjectCanvasNode[]): ProjectCanvasNode[] {
  return obstacles.filter(node => points.slice(1).some((point, index) => segmentIntersectsNode(points[index], point, node)))
}

function nearestBoundedDetour(
  from: number,
  to: number,
  before: number,
  after: number,
): number | null {
  const min = Math.min(from, to) - CANVAS_CONNECTOR_MAX_DETOUR
  const max = Math.max(from, to) + CANVAS_CONNECTOR_MAX_DETOUR
  const candidates = [before, after].filter(candidate => candidate >= min && candidate <= max)
  if (candidates.length === 0) return null
  return candidates.reduce((nearest, candidate) => (
    Math.abs(from - candidate) + Math.abs(to - candidate)
      < Math.abs(from - nearest) + Math.abs(to - nearest)
      ? candidate
      : nearest
  ))
}

function nearestHorizontalDetour(
  from: CanvasPoint,
  to: CanvasPoint,
  obstacles: readonly ProjectCanvasNode[],
): number | null {
  return nearestBoundedDetour(
    from.y,
    to.y,
    Math.min(...obstacles.map(node => node.y)) - ROUTE_CLEARANCE,
    Math.max(...obstacles.map(node => node.y + node.height)) + ROUTE_CLEARANCE,
  )
}

function nearestVerticalDetour(
  from: CanvasPoint,
  to: CanvasPoint,
  obstacles: readonly ProjectCanvasNode[],
): number | null {
  return nearestBoundedDetour(
    from.x,
    to.x,
    Math.min(...obstacles.map(node => node.x)) - ROUTE_CLEARANCE,
    Math.max(...obstacles.map(node => node.x + node.width)) + ROUTE_CLEARANCE,
  )
}

function detourRoute(
  from: CanvasPoint,
  to: CanvasPoint,
  fromSide: CanvasConnectionSide,
  toSide: CanvasConnectionSide,
  obstacles: readonly ProjectCanvasNode[],
): CanvasConnectorRoute | null {
  const fromStub = offsetForSide(from, fromSide, ROUTE_CLEARANCE)
  const toStub = offsetForSide(to, toSide, ROUTE_CLEARANCE)
  if (fromSide === 'left' || fromSide === 'right') {
    const y = nearestHorizontalDetour(from, to, obstacles)
    if (y === null) return null
    return { kind: 'orthogonal', points: [from, fromStub, { x: fromStub.x, y }, { x: toStub.x, y }, toStub, to] }
  }
  const x = nearestVerticalDetour(from, to, obstacles)
  if (x === null) return null
  return { kind: 'orthogonal', points: [from, fromStub, { x, y: fromStub.y }, { x, y: toStub.y }, toStub, to] }
}

function orthogonalRoute(
  from: CanvasPoint,
  to: CanvasPoint,
  fromSide: CanvasConnectionSide,
  toSide: CanvasConnectionSide,
  obstacles: readonly ProjectCanvasNode[],
): CanvasConnectorRoute {
  const horizontal = fromSide === 'left' || fromSide === 'right'
  const middle = horizontal ? (from.x + to.x) / 2 : (from.y + to.y) / 2
  const points = horizontal
    ? [from, { x: middle, y: from.y }, { x: middle, y: to.y }, to]
    : [from, { x: from.x, y: middle }, { x: to.x, y: middle }, to]
  const blocking = blockingNodes(points, obstacles)
  return blocking.length > 0
    ? detourRoute(from, to, fromSide, toSide, blocking) ?? { kind: 'orthogonal', points }
    : { kind: 'orthogonal', points }
}

export function connectorRouteBounds(from: CanvasPoint, to: CanvasPoint) {
  return {
    minX: Math.min(from.x, to.x) - ROUTE_CLEARANCE,
    minY: Math.min(from.y, to.y) - ROUTE_CLEARANCE,
    maxX: Math.max(from.x, to.x) + ROUTE_CLEARANCE,
    maxY: Math.max(from.y, to.y) + ROUTE_CLEARANCE,
  }
}

export function buildCanvasConnectorRoute(
  from: CanvasPoint,
  to: CanvasPoint,
  routing: ProjectCanvasEdgeRouting,
  fromSide: CanvasConnectionSide,
  toSide: CanvasConnectionSide,
  obstacles: readonly ProjectCanvasNode[] = [],
): CanvasConnectorRoute {
  if (routing === 'orthogonal') return orthogonalRoute(from, to, fromSide, toSide, obstacles)
  if (routing === 'curved') {
    const distance = Math.max(40, Math.min(160, (Math.abs(to.x - from.x) + Math.abs(to.y - from.y)) / 4))
    return {
      control1: offsetForSide(from, fromSide, distance),
      control2: offsetForSide(to, toSide, distance),
      kind: 'curved',
      points: [from, to],
    }
  }
  return { kind: 'straight', points: [from, to] }
}
