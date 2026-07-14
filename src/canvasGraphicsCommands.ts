import type { CanvasPoint, CanvasSceneSnapshot } from './canvasSceneStore'
import { cardinalConnectionAnchors, type CanvasConnectionAnchor } from './canvasNodeSpecRegistry'
import type {
  ProjectCanvasEdge,
  ProjectCanvasEdgeMarker,
  ProjectCanvasEdgeStrokeStyle,
  ProjectCanvasEdgeStrokeWidth,
  ProjectCanvasNode,
} from './projectCanvas'
import { buildCanvasConnectorRoute, connectorRouteBounds, type CanvasConnectorRoute } from './canvasConnectorRouting'

export { buildCanvasConnectorRoute } from './canvasConnectorRouting'
export type { CanvasConnectorRoute } from './canvasConnectorRouting'

export interface CanvasConnectorCommand {
  readonly edgeId: string
  readonly from: CanvasPoint
  readonly fromAnchorId: string
  readonly fromMarker: ProjectCanvasEdgeMarker
  readonly label: string | null
  readonly labelPoint: CanvasPoint
  readonly route: CanvasConnectorRoute
  readonly selected: boolean
  readonly strokeStyle: ProjectCanvasEdgeStrokeStyle
  readonly strokeWidth: ProjectCanvasEdgeStrokeWidth
  readonly to: CanvasPoint
  readonly toAnchorId: string
  readonly toMarker: ProjectCanvasEdgeMarker
}

export interface CanvasGraphicsCommandBatch {
  readonly connectors: readonly CanvasConnectorCommand[]
  readonly preview: { readonly from: CanvasPoint; readonly to: CanvasPoint } | null
}

export type CanvasConnectionAnchorResolver = (node: ProjectCanvasNode) => readonly CanvasConnectionAnchor[]
export type CanvasConnectorObstacleResolver = (
  edge: ProjectCanvasEdge,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
) => readonly ProjectCanvasNode[]

function distanceSquared(left: CanvasPoint, right: CanvasPoint): number {
  const x = left.x - right.x
  const y = left.y - right.y
  return x * x + y * y
}

function interpolate(from: CanvasPoint, to: CanvasPoint, ratio: number): CanvasPoint {
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
}

function connectorRouteMidpoint(route: CanvasConnectorRoute): CanvasPoint {
  if (route.kind === 'curved') {
    const [from, to] = route.points
    return {
      x: (from.x + 3 * route.control1.x + 3 * route.control2.x + to.x) / 8,
      y: (from.y + 3 * route.control1.y + 3 * route.control2.y + to.y) / 8,
    }
  }
  const segments = route.points.slice(1).map((point, index) => {
    const from = route.points[index]
    return { from, to: point, length: Math.hypot(point.x - from.x, point.y - from.y) }
  })
  const halfLength = segments.reduce((total, segment) => total + segment.length, 0) / 2
  let traversed = 0
  for (const segment of segments) {
    if (traversed + segment.length >= halfLength) {
      const ratio = segment.length === 0 ? 0 : (halfLength - traversed) / segment.length
      return interpolate(segment.from, segment.to, ratio)
    }
    traversed += segment.length
  }
  return route.points.at(-1) ?? { x: 0, y: 0 }
}

export function connectionAnchorToward(
  node: ProjectCanvasNode,
  target: CanvasPoint,
  resolveAnchors: CanvasConnectionAnchorResolver = cardinalConnectionAnchors,
): CanvasConnectionAnchor {
  const resolvedAnchors = resolveAnchors(node)
  const anchors = resolvedAnchors.length > 0 ? resolvedAnchors : cardinalConnectionAnchors(node)
  return anchors.reduce((nearest, anchor) => (
    distanceSquared(anchor.point, target) < distanceSquared(nearest.point, target) ? anchor : nearest
  ), anchors[0])
}

export function buildCanvasGraphicsCommandBatch(
  scene: CanvasSceneSnapshot,
  edges: readonly ProjectCanvasEdge[],
  selectedEdgeIds: ReadonlySet<string>,
  preview: CanvasGraphicsCommandBatch['preview'] = null,
  resolveAnchors: CanvasConnectionAnchorResolver = cardinalConnectionAnchors,
  resolveObstacles?: CanvasConnectorObstacleResolver,
): CanvasGraphicsCommandBatch {
  const connectors: CanvasConnectorCommand[] = []
  for (const edge of edges) {
    const fromNode = scene.nodesById[edge.from]
    const toNode = scene.nodesById[edge.to]
    if (!fromNode || !toNode) continue
    const fromTarget = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 }
    const toTarget = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 }
    const fromAnchor = connectionAnchorToward(fromNode, fromTarget, resolveAnchors)
    const toAnchor = connectionAnchorToward(toNode, toTarget, resolveAnchors)
    const obstacleBounds = connectorRouteBounds(fromAnchor.point, toAnchor.point)
    const obstacles = edge.routing === 'orthogonal' && resolveObstacles
      ? resolveObstacles(edge, obstacleBounds)
      : []
    const route = buildCanvasConnectorRoute(
      fromAnchor.point,
      toAnchor.point,
      edge.routing ?? 'straight',
      fromAnchor.side,
      toAnchor.side,
      obstacles,
    )
    connectors.push({
      edgeId: edge.id,
      from: fromAnchor.point,
      fromAnchorId: fromAnchor.id,
      fromMarker: edge.fromMarker ?? 'none',
      label: edge.label?.trim() || null,
      labelPoint: connectorRouteMidpoint(route),
      route,
      selected: selectedEdgeIds.has(edge.id),
      strokeStyle: edge.strokeStyle ?? 'solid',
      strokeWidth: edge.strokeWidth ?? 2,
      to: toAnchor.point,
      toAnchorId: toAnchor.id,
      toMarker: edge.toMarker ?? 'none',
    })
  }
  return { connectors, preview }
}
