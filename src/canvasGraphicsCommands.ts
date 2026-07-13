import type { CanvasPoint, CanvasSceneSnapshot } from './canvasSceneStore'
import { cardinalConnectionAnchors, type CanvasConnectionAnchor } from './canvasNodeSpecRegistry'
import type { ProjectCanvasEdge, ProjectCanvasNode } from './projectCanvas'

export interface CanvasConnectorCommand {
  readonly edgeId: string
  readonly from: CanvasPoint
  readonly fromAnchorId: string
  readonly to: CanvasPoint
  readonly toAnchorId: string
  readonly selected: boolean
}

export interface CanvasGraphicsCommandBatch {
  readonly connectors: readonly CanvasConnectorCommand[]
  readonly preview: { readonly from: CanvasPoint; readonly to: CanvasPoint } | null
}

export type CanvasConnectionAnchorResolver = (node: ProjectCanvasNode) => readonly CanvasConnectionAnchor[]

function distanceSquared(left: CanvasPoint, right: CanvasPoint): number {
  const x = left.x - right.x
  const y = left.y - right.y
  return x * x + y * y
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
    connectors.push({
      edgeId: edge.id,
      from: fromAnchor.point,
      fromAnchorId: fromAnchor.id,
      selected: selectedEdgeIds.has(edge.id),
      to: toAnchor.point,
      toAnchorId: toAnchor.id,
    })
  }
  return { connectors, preview }
}
